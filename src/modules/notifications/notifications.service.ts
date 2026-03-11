// docs/telegram/notifications.md — Notification Service
// docs/backlog.md #72-#80 — Notification module
// Schedules BullMQ jobs for booking notifications

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES, NotificationJobData } from '../../common/bullmq/tenant-context';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notifQueue: Queue,
  ) {}

  /**
   * Schedule all notifications for a new booking.
   * docs/telegram/notifications.md — Job Creation:
   *   1. confirmation (immediate) → client
   *   2. new_booking (immediate) → master (if created by client)
   *   3. reminder_24h (delayed) → client
   *   4. reminder_1h (delayed) → client
   */
  async scheduleBookingNotifications(
    tenantId: string,
    bookingId: string,
    clientId: string,
    startTime: Date,
    createdBy: 'master' | 'client',
  ) {
    const now = Date.now();
    const bookingTime = startTime.getTime();

    // 1. Confirmation to client (immediate)
    const confirmJob = await this.addNotificationJob(
      tenantId,
      bookingId,
      clientId,
      'confirmation',
      0,
    );

    // 2. New booking to master (if created by client)
    if (createdBy === 'client') {
      await this.addNotificationJob(
        tenantId,
        bookingId,
        clientId,
        'new_booking',
        0,
      );
    }

    // 3. Reminder 24h before (only if > 24h from now)
    const delay24h = bookingTime - 24 * 60 * 60 * 1000 - now;
    if (delay24h > 60000) {
      // At least 1 minute in the future
      await this.addNotificationJob(
        tenantId,
        bookingId,
        clientId,
        'reminder_24h',
        delay24h,
      );
    }

    // 4. Reminder 1h before (only if > 1h from now)
    const delay1h = bookingTime - 1 * 60 * 60 * 1000 - now;
    if (delay1h > 60000) {
      await this.addNotificationJob(
        tenantId,
        bookingId,
        clientId,
        'reminder_1h',
        delay1h,
      );
    }

    this.logger.log(
      `Notifications scheduled for booking ${bookingId} in tenant ${tenantId}`,
    );
  }

  /**
   * Cancel all pending notifications for a booking.
   * docs/telegram/notifications.md — Edge Case #1
   *   → Remove pending BullMQ jobs
   *   → Mark pending notifications as 'cancelled'
   *   → Create cancellation notification (immediate)
   */
  async cancelBookingNotifications(
    tenantId: string,
    bookingId: string,
    clientId: string,
    cancelledBy: 'master' | 'client',
  ) {
    // Find all pending notifications for this booking
    const pendingNotifs = await this.prisma.tenantClient.notification.findMany({
      where: {
        tenantId,
        bookingId,
        status: 'pending',
      },
    });

    // Remove BullMQ jobs and mark as cancelled
    for (const notif of pendingNotifs) {
      if (notif.jobId) {
        try {
          const job = await this.notifQueue.getJob(notif.jobId);
          if (job) await job.remove();
        } catch {
          // Job may already be processed or removed
        }
      }

      await this.prisma.tenantClient.notification.update({
        where: { id: notif.id },
        data: { status: 'cancelled' },
      });
    }

    // Schedule cancellation notification (immediate)
    await this.addNotificationJob(
      tenantId,
      bookingId,
      clientId,
      'cancellation',
      0,
    );

    // If cancelled by client, also notify master
    if (cancelledBy === 'client') {
      await this.addNotificationJob(
        tenantId,
        bookingId,
        clientId,
        'cancellation',
        0,
        // This will be handled in the processor — it sends to master
      );
    }

    this.logger.log(
      `Notifications cancelled for booking ${bookingId} in tenant ${tenantId}`,
    );
  }

  /**
   * Add a notification job to the BullMQ queue.
   * Creates a notification record in DB + enqueues the job.
   */
  private async addNotificationJob(
    tenantId: string,
    bookingId: string,
    clientId: string,
    type: NotificationJobData['type'],
    delay: number,
  ) {
    const scheduledAt = new Date(Date.now() + delay);

    // Create notification record in DB
    const notification = await this.prisma.tenantClient.notification.create({
      data: {
        tenantId,
        bookingId,
        clientId,
        type,
        channel: 'telegram',
        status: 'pending',
        scheduledAt,
      },
    });

    // Enqueue BullMQ job
    const jobData: NotificationJobData = {
      tenantId,
      bookingId,
      clientId,
      type,
    };

    const job = await this.notifQueue.add(
      `notify:${type}`,
      jobData,
      {
        delay: Math.max(0, delay),
        jobId: `notif-${notification.id}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30s → 60s → 120s
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    // Update notification with job ID
    await this.prisma.tenantClient.notification.update({
      where: { id: notification.id },
      data: { jobId: job.id },
    });

    return notification;
  }
}
