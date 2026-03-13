import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Calendar, CheckCircle, XCircle, Plus } from 'lucide-react';
import {
  useBookings,
  useCompleteBooking,
  useNoShowBooking,
  useCreateBooking,
  useServices,
  useClients,
  useSlots,
} from '@/hooks';
import {
  Card,
  SkeletonList,
  EmptyState,
  PageHeader,
  DatePicker,
  Badge,
  BottomSheet,
  Button,
  FormGroup,
} from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Service, Client } from '@/types';
import styles from './CalendarPage.module.css';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

export function CalendarPage() {
  const intl = useIntl();
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const { data: bookingsData, isLoading } = useBookings();
  const completeBooking = useCompleteBooking();
  const noShowBooking = useNoShowBooking();

  // Manual booking state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');

  const { data: servicesData } = useServices();
  const { data: clientsData } = useClients();
  const createBooking = useCreateBooking();
  const { data: slotsData } = useSlots(selectedDate, selectedServiceId);

  const services = (servicesData as Service[] | undefined) || [];
  const clients = (clientsData?.items as Client[] | undefined) || [];
  const slots = slotsData?.slots?.filter((s) => s.available) || [];

  const allBookings = bookingsData?.items || [];

  // Filter bookings by selected date
  const bookings = allBookings.filter((b) => {
    const bookingDate = new Date(b.startTime).toISOString().split('T')[0];
    return bookingDate === selectedDate;
  });

  // Sort by time
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const handleComplete = async (id: string) => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      await completeBooking.mutateAsync(id);
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleNoShow = async (id: string) => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      await noShowBooking.mutateAsync(id);
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleOpenAddForm = () => {
    setSelectedServiceId('');
    setSelectedClientId('');
    setSelectedSlot('');
    setBookingNotes('');
    setShowAddForm(true);
  };

  const handleCreateBooking = () => {
    if (!selectedServiceId || !selectedSlot) return;
    const startTime = `${selectedDate}T${selectedSlot}:00`;
    createBooking.mutate(
      {
        serviceId: selectedServiceId,
        startTime,
        clientId: selectedClientId || undefined,
        notes: bookingNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowAddForm(false);
        },
      },
    );
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success' as const;
      case 'cancelled':
      case 'no_show':
        return 'destructive' as const;
      default:
        return 'warning' as const;
    }
  };

  return (
    <div className="page animate-fade-in">
      <PageHeader
        title={intl.formatMessage({ id: 'master.calendar' })}
        action={
          <button
            className={styles.addBtn}
            onClick={handleOpenAddForm}
            aria-label={intl.formatMessage({ id: 'common.add' })}
          >
            <Plus size={20} />
          </button>
        }
      />

      <div className={styles.datePickerWrap}>
        <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} daysAhead={60} />
      </div>

      {isLoading && <SkeletonList count={5} />}

      {!isLoading && sorted.length === 0 && (
        <EmptyState
          icon={<Calendar size={40} />}
          title={intl.formatMessage({ id: 'master.noBookingsToday' })}
          description={formatDateDisplay(`${selectedDate}T00:00:00`)}
        />
      )}

      {sorted.map((booking) => (
        <Card key={booking.id} className={styles.bookingCard}>
          <span className={styles.bookingTime}>{formatTime(booking.startTime)}</span>
          <div className={styles.bookingBody}>
            <div className={styles.bookingService}>{booking.serviceNameSnapshot}</div>
            {booking.client && (
              <div className={styles.bookingClient}>
                {booking.client.firstName} {booking.client.lastName || ''}
              </div>
            )}
          </div>
          {(booking.status === 'confirmed' || booking.status === 'pending') && (
            <div className={styles.bookingActions}>
              <button
                className="touchable"
                onClick={() => handleComplete(booking.id)}
                aria-label={intl.formatMessage({ id: 'booking.status.completed' })}
              >
                <CheckCircle size={20} color="var(--color-success)" />
              </button>
              <button
                className="touchable"
                onClick={() => handleNoShow(booking.id)}
                aria-label={intl.formatMessage({ id: 'booking.status.no_show' })}
              >
                <XCircle size={20} color="var(--color-destructive)" />
              </button>
            </div>
          )}
          {booking.status !== 'confirmed' && booking.status !== 'pending' && (
            <Badge variant={statusVariant(booking.status)}>
              {intl.formatMessage({ id: `booking.status.${booking.status}` })}
            </Badge>
          )}
        </Card>
      ))}

      {/* Manual booking BottomSheet */}
      <BottomSheet
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        title={intl.formatMessage({ id: 'calendar.addBooking' })}
      >
        <FormGroup>
          <label className={styles.fieldLabel}>
            {intl.formatMessage({ id: 'booking.selectService' })}
          </label>
          <select
            className={styles.selectField}
            value={selectedServiceId}
            onChange={(e) => {
              setSelectedServiceId(e.target.value);
              setSelectedSlot('');
            }}
          >
            <option value="">—</option>
            {services
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} {intl.formatMessage({ id: 'common.min' })})
                </option>
              ))}
          </select>

          <label className={styles.fieldLabel}>
            {intl.formatMessage({ id: 'calendar.selectClient' })}
          </label>
          <select
            className={styles.selectField}
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">{intl.formatMessage({ id: 'calendar.walkIn' })}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName || ''}
              </option>
            ))}
          </select>

          {selectedServiceId && (
            <>
              <label className={styles.fieldLabel}>
                {intl.formatMessage({ id: 'booking.selectTime' })}
              </label>
              {slots.length > 0 ? (
                <div className={styles.slotsGrid}>
                  {slots.map((slot) => (
                    <button
                      key={slot.startTime}
                      className={`${styles.slotBtn} ${selectedSlot === slot.startTime ? styles.slotActive : ''}`}
                      onClick={() => setSelectedSlot(slot.startTime)}
                    >
                      {slot.startTime}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.noSlots}>
                  {intl.formatMessage({ id: 'booking.noSlots' })}
                </p>
              )}
            </>
          )}

          <label className={styles.fieldLabel}>
            {intl.formatMessage({ id: 'calendar.notes' })}
          </label>
          <textarea
            className={styles.textArea}
            value={bookingNotes}
            onChange={(e) => setBookingNotes(e.target.value)}
            rows={2}
            placeholder={intl.formatMessage({ id: 'calendar.notesPlaceholder' })}
          />

          <Button
            onClick={handleCreateBooking}
            disabled={!selectedServiceId || !selectedSlot || createBooking.isPending}
            style={{ marginTop: 8 }}
          >
            {createBooking.isPending
              ? intl.formatMessage({ id: 'common.loading' })
              : intl.formatMessage({ id: 'booking.confirm' })}
          </Button>
        </FormGroup>
      </BottomSheet>
    </div>
  );
}
