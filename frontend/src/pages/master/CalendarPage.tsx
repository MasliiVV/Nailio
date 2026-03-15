import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Calendar,
  Plus,
  Clock,
  Ban,
  UserRoundCog,
  Pencil,
  User,
  Trash2,
  MessageCircle,
} from 'lucide-react';
import {
  useBookings,
  useCreateBooking,
  useCancelBooking,
  useDeleteBooking,
  useRescheduleBooking,
  useUpdateBooking,
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
import { getTelegram, openTelegramUserChat } from '@/lib/telegram';
import type { Service, Client, Booking } from '@/types';
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
  const [manualBookingDate, setManualBookingDate] = useState(formatDateKey(new Date()));
  const { data: bookingsData, isLoading } = useBookings();
  const cancelBooking = useCancelBooking();
  const deleteBooking = useDeleteBooking();
  const rescheduleBooking = useRescheduleBooking();
  const updateBooking = useUpdateBooking();

  // Manual booking state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');

  // Booking detail state
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [detailMode, setDetailMode] = useState<
    'view' | 'edit' | 'reschedule' | 'reassign' | 'cancel' | 'delete'
  >('view');
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [reassignClientId, setReassignClientId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editServiceId, setEditServiceId] = useState('');
  const [editStatus, setEditStatus] = useState<string>('');

  const { data: servicesData } = useServices();
  const { data: clientsData } = useClients();
  const createBooking = useCreateBooking();

  // Slots for add form
  const { data: slotsData } = useSlots(manualBookingDate, selectedServiceId);

  // Slots for reschedule — use the booking's service
  const rescheduleServiceId = selectedBooking?.service?.id || '';
  const { data: rescheduleSlotsData } = useSlots(selectedDate, rescheduleServiceId);

  const services = (servicesData as Service[] | undefined) || [];
  const clients = (clientsData?.items as Client[] | undefined) || [];
  const slots = slotsData?.slots?.filter((s) => s.available) || [];
  const rescheduleSlots = rescheduleSlotsData?.slots?.filter((s) => s.available) || [];

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

  const handleOpenBookingDetail = (booking: Booking) => {
    setSelectedBooking(booking);
    setDetailMode('view');
    setRescheduleSlot('');
    setReassignClientId('');
    setEditNotes(booking.notes || '');
    setEditServiceId(booking.service?.id || '');
    setEditStatus(booking.status);
  };

  const handleCloseDetail = () => {
    setSelectedBooking(null);
    setDetailMode('view');
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    getTelegram()?.HapticFeedback.impactOccurred('heavy');
    try {
      await cancelBooking.mutateAsync({ id: selectedBooking.id });
      handleCloseDetail();
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleReschedule = async () => {
    if (!selectedBooking || !rescheduleSlot) return;
    const startTime = `${selectedDate}T${rescheduleSlot}:00`;
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      await rescheduleBooking.mutateAsync({
        id: selectedBooking.id,
        dto: { startTime },
      });
      handleCloseDetail();
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleReassign = async () => {
    if (!selectedBooking || !reassignClientId) return;
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      await rescheduleBooking.mutateAsync({
        id: selectedBooking.id,
        dto: {
          startTime: selectedBooking.startTime,
          clientId: reassignClientId,
        },
      });
      handleCloseDetail();
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleUpdateBooking = async () => {
    if (!selectedBooking) return;
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      const dto: Record<string, unknown> = {};

      // Only send notes if changed
      if (editNotes !== (selectedBooking.notes || '')) {
        dto.notes = editNotes;
      }

      // Only send serviceId if actually changed and valid
      if (editServiceId && editServiceId !== selectedBooking.service?.id) {
        dto.serviceId = editServiceId;
      }

      // Only send status if changed to completed/cancelled
      if (
        editStatus !== selectedBooking.status &&
        (editStatus === 'completed' || editStatus === 'cancelled')
      ) {
        dto.status = editStatus;
      }

      await updateBooking.mutateAsync({
        id: selectedBooking.id,
        dto,
      });
      handleCloseDetail();
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleDeleteBooking = async () => {
    if (!selectedBooking) return;
    getTelegram()?.HapticFeedback.impactOccurred('heavy');
    try {
      await deleteBooking.mutateAsync(selectedBooking.id);
      handleCloseDetail();
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleOpenAddForm = () => {
    setManualBookingDate(selectedDate);
    setSelectedServiceId('');
    setSelectedClientId('');
    setSelectedSlot('');
    setBookingNotes('');
    setShowAddForm(true);
  };

  const handleCreateBooking = () => {
    if (!selectedServiceId || !selectedSlot) return;
    const startTime = `${manualBookingDate}T${selectedSlot}:00`;
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
        <Card
          key={booking.id}
          className={styles.bookingCard}
          onClick={() => handleOpenBookingDetail(booking)}
          style={{ cursor: 'pointer' }}
        >
          <span className={styles.bookingTime}>{formatTime(booking.startTime)}</span>
          <div className={styles.bookingBody}>
            <div className={styles.bookingService}>{booking.serviceNameSnapshot}</div>
            {booking.client && (
              <div className={styles.bookingClient}>
                {booking.client.firstName} {booking.client.lastName || ''}
              </div>
            )}
          </div>
          <Badge variant={statusVariant(booking.status)}>
            {intl.formatMessage({ id: `booking.status.${booking.status}` })}
          </Badge>
        </Card>
      ))}

      {/* Booking detail BottomSheet */}
      {selectedBooking && (
        <BottomSheet
          open={!!selectedBooking}
          onClose={handleCloseDetail}
          title={intl.formatMessage({ id: 'calendar.bookingDetails' })}
        >
          {detailMode === 'view' && (
            <>
              {selectedBooking.client && (
                <div className={styles.detailRow}>
                  <User size={18} className={styles.detailIcon} />
                  <div>
                    <div className={styles.detailLabel}>
                      {intl.formatMessage({ id: 'clients.title' })}
                    </div>
                    <div className={styles.detailValue}>
                      {selectedBooking.client.firstName} {selectedBooking.client.lastName || ''}
                    </div>
                  </div>
                </div>
              )}

              {selectedBooking.client?.phone && (
                <div className={styles.detailRow}>
                  <Clock size={18} className={styles.detailIcon} />
                  <div>
                    <div className={styles.detailLabel}>
                      {intl.formatMessage({ id: 'calendar.phone' })}
                    </div>
                    <div className={styles.detailValue}>{selectedBooking.client.phone}</div>
                  </div>
                </div>
              )}

              {selectedBooking.client?.telegramId && (
                <div className={styles.detailRow}>
                  <MessageCircle size={18} className={styles.detailIcon} />
                  <div>
                    <div className={styles.detailLabel}>
                      {intl.formatMessage({ id: 'clients.telegramId' })}
                    </div>
                    <div className={styles.detailValue}>{selectedBooking.client.telegramId}</div>
                  </div>
                </div>
              )}

              <div className={styles.detailRow}>
                <Clock size={18} className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>
                    {intl.formatMessage({ id: 'booking.selectTime' })}
                  </div>
                  <div className={styles.detailValue}>
                    {formatTime(selectedBooking.startTime)} — {formatTime(selectedBooking.endTime)}
                  </div>
                </div>
              </div>

              <div className={styles.detailRow}>
                <Pencil size={18} className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>
                    {intl.formatMessage({ id: 'booking.selectService' })}
                  </div>
                  <div className={styles.detailValue}>{selectedBooking.serviceNameSnapshot}</div>
                </div>
              </div>

              <div className={styles.detailRow}>
                <Ban size={18} className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>
                    {intl.formatMessage({ id: 'calendar.status' })}
                  </div>
                  <div className={styles.detailValue}>
                    <Badge variant={statusVariant(selectedBooking.status)}>
                      {intl.formatMessage({
                        id: `booking.status.${selectedBooking.status}`,
                      })}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className={styles.detailRow}>
                <Clock size={18} className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>
                    {intl.formatMessage({ id: 'calendar.price' })}
                  </div>
                  <div className={styles.detailValue}>
                    {(selectedBooking.priceAtBooking / 100).toFixed(0)}{' '}
                    {intl.formatMessage({ id: 'common.uah' })}
                  </div>
                </div>
              </div>

              {selectedBooking.notes && (
                <div className={styles.detailRow}>
                  <Pencil size={18} className={styles.detailIcon} />
                  <div>
                    <div className={styles.detailLabel}>
                      {intl.formatMessage({ id: 'calendar.notes' })}
                    </div>
                    <div className={styles.detailValue}>{selectedBooking.notes}</div>
                  </div>
                </div>
              )}

              <div className={styles.detailActions}>
                {selectedBooking.client?.telegramId && (
                  <button
                    className={styles.detailActionBtn}
                    onClick={() =>
                      openTelegramUserChat(selectedBooking.client?.telegramId as string)
                    }
                  >
                    <MessageCircle size={16} />
                    {intl.formatMessage({ id: 'clients.writeInTelegram' })}
                  </button>
                )}
                <button
                  className={styles.detailActionBtn}
                  onClick={() => {
                    setEditNotes(selectedBooking.notes || '');
                    setEditServiceId(selectedBooking.service?.id || '');
                    setEditStatus(selectedBooking.status);
                    setDetailMode('edit');
                  }}
                >
                  <Pencil size={16} />
                  {intl.formatMessage({ id: 'calendar.editBooking' })}
                </button>
                <button
                  className={styles.detailActionBtn}
                  onClick={() => setDetailMode('reschedule')}
                >
                  <Clock size={16} />
                  {intl.formatMessage({ id: 'calendar.reschedule' })}
                </button>
                <button
                  className={styles.detailActionBtn}
                  onClick={() => setDetailMode('reassign')}
                >
                  <UserRoundCog size={16} />
                  {intl.formatMessage({ id: 'calendar.reassign' })}
                </button>
                <button
                  className={styles.detailActionBtnDanger}
                  onClick={() => setDetailMode('delete')}
                >
                  <Trash2 size={16} />
                  {intl.formatMessage({ id: 'calendar.deleteBooking' })}
                </button>
              </div>
            </>
          )}

          {detailMode === 'reschedule' && (
            <>
              <p className={styles.subTitle}>
                {intl.formatMessage({ id: 'calendar.selectNewTime' })}
              </p>
              <div className={styles.datePickerWrap}>
                <DatePicker
                  selectedDate={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    setRescheduleSlot('');
                  }}
                  daysAhead={60}
                />
              </div>
              {rescheduleSlots.length > 0 ? (
                <div className={styles.slotsGrid}>
                  {rescheduleSlots.map((slot) => (
                    <button
                      key={slot.startTime}
                      className={`${styles.slotBtn} ${rescheduleSlot === slot.startTime ? styles.slotActive : ''}`}
                      onClick={() => setRescheduleSlot(slot.startTime)}
                    >
                      {slot.startTime}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.noSlots}>{intl.formatMessage({ id: 'booking.noSlots' })}</p>
              )}
              <div className={styles.cancelConfirmActions} style={{ marginTop: 16 }}>
                <Button
                  variant="secondary"
                  onClick={() => setDetailMode('view')}
                  style={{ flex: 1 }}
                >
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
                <Button
                  onClick={handleReschedule}
                  disabled={!rescheduleSlot || rescheduleBooking.isPending}
                  style={{ flex: 1 }}
                >
                  {rescheduleBooking.isPending
                    ? intl.formatMessage({ id: 'common.loading' })
                    : intl.formatMessage({ id: 'calendar.apply' })}
                </Button>
              </div>
            </>
          )}

          {detailMode === 'reassign' && (
            <>
              <p className={styles.subTitle}>
                {intl.formatMessage({ id: 'calendar.selectNewClient' })}
              </p>
              <select
                className={styles.selectField}
                value={reassignClientId}
                onChange={(e) => setReassignClientId(e.target.value)}
              >
                <option value="">—</option>
                {clients
                  .filter((c) => c.id !== selectedBooking.client?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName || ''}
                    </option>
                  ))}
              </select>
              <div className={styles.cancelConfirmActions} style={{ marginTop: 16 }}>
                <Button
                  variant="secondary"
                  onClick={() => setDetailMode('view')}
                  style={{ flex: 1 }}
                >
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
                <Button
                  onClick={handleReassign}
                  disabled={!reassignClientId || rescheduleBooking.isPending}
                  style={{ flex: 1 }}
                >
                  {rescheduleBooking.isPending
                    ? intl.formatMessage({ id: 'common.loading' })
                    : intl.formatMessage({ id: 'calendar.apply' })}
                </Button>
              </div>
            </>
          )}

          {detailMode === 'edit' && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label className={styles.fieldLabel}>
                  {intl.formatMessage({ id: 'calendar.editService' })}
                </label>
                <select
                  className={styles.selectField}
                  value={editServiceId}
                  onChange={(e) => setEditServiceId(e.target.value)}
                >
                  {services
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.durationMinutes} {intl.formatMessage({ id: 'common.min' })}) —{' '}
                        {(s.price / 100).toFixed(0)} {intl.formatMessage({ id: 'common.uah' })}
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className={styles.fieldLabel}>
                  {intl.formatMessage({ id: 'calendar.editStatus' })}
                </label>
                <select
                  className={styles.selectField}
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="pending">
                    {intl.formatMessage({ id: 'booking.status.pending' })}
                  </option>
                  <option value="confirmed">
                    {intl.formatMessage({ id: 'booking.status.confirmed' })}
                  </option>
                  <option value="completed">
                    {intl.formatMessage({ id: 'calendar.statusCompleted' })}
                  </option>
                  <option value="cancelled">
                    {intl.formatMessage({ id: 'calendar.statusCancelled' })}
                  </option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className={styles.fieldLabel}>
                  {intl.formatMessage({ id: 'calendar.editNotes' })}
                </label>
                <textarea
                  className={styles.textArea}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder={intl.formatMessage({ id: 'calendar.notesPlaceholder' })}
                />
              </div>

              <div className={styles.cancelConfirmActions}>
                <Button
                  variant="secondary"
                  onClick={() => setDetailMode('view')}
                  style={{ flex: 1 }}
                >
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
                <Button
                  onClick={handleUpdateBooking}
                  disabled={updateBooking.isPending}
                  style={{ flex: 1 }}
                >
                  {updateBooking.isPending
                    ? intl.formatMessage({ id: 'common.loading' })
                    : intl.formatMessage({ id: 'common.save' })}
                </Button>
              </div>
            </>
          )}

          {detailMode === 'delete' && (
            <div className={styles.cancelConfirm}>
              <p className={styles.cancelConfirmText}>
                {intl.formatMessage({ id: 'calendar.confirmDelete' })}
              </p>
              <div className={styles.cancelConfirmActions}>
                <Button
                  variant="secondary"
                  onClick={() => setDetailMode('view')}
                  style={{ flex: 1 }}
                >
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteBooking}
                  disabled={deleteBooking.isPending}
                  style={{ flex: 1 }}
                >
                  {deleteBooking.isPending
                    ? intl.formatMessage({ id: 'common.loading' })
                    : intl.formatMessage({ id: 'common.delete' })}
                </Button>
              </div>
            </div>
          )}

          {detailMode === 'cancel' && (
            <div className={styles.cancelConfirm}>
              <p className={styles.cancelConfirmText}>
                {intl.formatMessage({ id: 'calendar.confirmCancel' })}
              </p>
              <div className={styles.cancelConfirmActions}>
                <Button
                  variant="secondary"
                  onClick={() => setDetailMode('view')}
                  style={{ flex: 1 }}
                >
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancelBooking}
                  disabled={cancelBooking.isPending}
                  style={{ flex: 1 }}
                >
                  {cancelBooking.isPending
                    ? intl.formatMessage({ id: 'common.loading' })
                    : intl.formatMessage({ id: 'calendar.cancelBooking' })}
                </Button>
              </div>
            </div>
          )}
        </BottomSheet>
      )}

      {/* Manual booking BottomSheet */}
      <BottomSheet
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        title={intl.formatMessage({ id: 'calendar.addBooking' })}
      >
        <FormGroup>
          <label className={styles.fieldLabel}>
            {intl.formatMessage({ id: 'booking.selectDate' })}
          </label>
          <div className={styles.datePickerWrap}>
            <DatePicker
              selectedDate={manualBookingDate}
              onSelect={(date) => {
                setManualBookingDate(date);
                setSelectedSlot('');
              }}
              daysAhead={60}
            />
          </div>

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
                <p className={styles.noSlots}>{intl.formatMessage({ id: 'booking.noSlots' })}</p>
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
