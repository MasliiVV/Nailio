import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Clock3, Send, Sparkles } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  PageHeader,
  SkeletonList,
} from '@/components/ui';
import { useClients } from '@/hooks';
import {
  useGenerateRebookingMessage,
  useRebookingOverview,
  useSendRebookingCampaign,
} from '@/hooks/useRebooking';
import type { Client, RebookingEmptySlot, RebookingRecommendation } from '@/types';
import styles from './SmartRebookingPage.module.css';

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

const FILTERS = [
  'all',
  'due_soon',
  'visits_3_plus',
  'morning',
  'favorite_service',
  'irregular',
] as const;

type FilterKey = (typeof FILTERS)[number];

export function SmartRebookingPage() {
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(
    searchParams.get('date') || formatDateKey(new Date()),
  );
  const initialSlot = searchParams.get('slot');
  const [segmentFilter, setSegmentFilter] = useState<FilterKey>('all');
  const [selectedSlotKey, setSelectedSlotKey] = useState<string>('');
  const [slotAudienceMode, setSlotAudienceMode] = useState<'all' | 'selected'>('all');
  const [cycleAudienceMode, setCycleAudienceMode] = useState<'all' | 'selected'>('selected');
  const [slotSelectedClientIds, setSlotSelectedClientIds] = useState<string[]>([]);
  const [cycleSelectedClientIds, setCycleSelectedClientIds] = useState<string[]>([]);
  const [slotTone, setSlotTone] = useState<'soft' | 'friendly'>('friendly');
  const [cycleTone, setCycleTone] = useState<'soft' | 'friendly'>('friendly');
  const [slotMessage, setSlotMessage] = useState('');
  const [cycleMessage, setCycleMessage] = useState('');

  const { data, isLoading } = useRebookingOverview(selectedDate);
  const { data: clientsData, isLoading: clientsLoading } = useClients();
  const generateSlotMessage = useGenerateRebookingMessage();
  const generateCycleMessage = useGenerateRebookingMessage();
  const sendSlotCampaign = useSendRebookingCampaign();
  const sendCycleCampaign = useSendRebookingCampaign();

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', selectedDate);
      if (selectedSlotKey) {
        next.set('slot', selectedSlotKey.split('-').slice(1).join('-'));
      } else {
        next.delete('slot');
      }
      return next;
    });
  }, [selectedDate, selectedSlotKey, setSearchParams]);

  const availableSlots = useMemo(
    () => (data?.emptySlots || []).filter((slot) => slot.date === selectedDate),
    [data?.emptySlots, selectedDate],
  );

  const selectedSlot = useMemo(
    () =>
      availableSlots.find((slot) => `${slot.date}-${slot.startTime}` === selectedSlotKey) || null,
    [availableSlots, selectedSlotKey],
  );

  const allClients = useMemo(
    () => (clientsData?.items || []).filter((client) => Boolean(client.telegramId)),
    [clientsData?.items],
  );

  useEffect(() => {
    if (!availableSlots.length) {
      setSelectedSlotKey('');
      return;
    }

    if (initialSlot) {
      const requestedSlot = availableSlots.find((slot) => slot.startTime === initialSlot);
      if (requestedSlot) {
        setSelectedSlotKey(`${requestedSlot.date}-${requestedSlot.startTime}`);
        return;
      }
    }

    const hasSelected = availableSlots.some(
      (slot) => `${slot.date}-${slot.startTime}` === selectedSlotKey,
    );
    if (!hasSelected) {
      const [firstSlot] = availableSlots;
      if (firstSlot) {
        setSelectedSlotKey(`${firstSlot.date}-${firstSlot.startTime}`);
      }
    }
  }, [availableSlots, initialSlot, selectedSlotKey]);

  const filteredRecommendations = useMemo(() => {
    const items = data?.recommendations || [];
    return items.filter((item) => {
      if (segmentFilter === 'all') return true;
      return item.segments.includes(segmentFilter);
    });
  }, [data?.recommendations, segmentFilter]);

  useEffect(() => {
    if (
      slotAudienceMode === 'selected' &&
      slotSelectedClientIds.length === 0 &&
      allClients.length > 0
    ) {
      setSlotSelectedClientIds(allClients.slice(0, 8).map((client) => client.id));
    }
  }, [allClients, slotAudienceMode, slotSelectedClientIds.length]);

  useEffect(() => {
    if (
      cycleAudienceMode === 'selected' &&
      cycleSelectedClientIds.length === 0 &&
      filteredRecommendations.length > 0
    ) {
      setCycleSelectedClientIds(filteredRecommendations.slice(0, 5).map((item) => item.clientId));
    }
  }, [cycleAudienceMode, cycleSelectedClientIds.length, filteredRecommendations]);

  useEffect(() => {
    if (!selectedSlot) {
      setSlotMessage('');
      return;
    }

    setSlotMessage(buildDefaultSlotMessage(selectedSlot));
  }, [selectedSlot]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setCycleMessage(buildDefaultCycleMessage(data.defaultCycleDays));
  }, [data]);

  const cycleSlotPreview = useMemo(() => (data?.emptySlots || []).slice(0, 6), [data?.emptySlots]);

  const slotSelectedCount =
    slotAudienceMode === 'all' ? allClients.length : slotSelectedClientIds.length;
  const cycleSelectedCount =
    cycleAudienceMode === 'all' ? data?.recommendations.length || 0 : cycleSelectedClientIds.length;

  const slotPreviewClientIds =
    slotAudienceMode === 'all'
      ? allClients.slice(0, 3).map((client) => client.id)
      : slotSelectedClientIds.slice(0, 3);
  const cyclePreviewClientIds =
    cycleAudienceMode === 'all'
      ? (data?.recommendations || []).slice(0, 3).map((item) => item.clientId)
      : cycleSelectedClientIds.slice(0, 3);

  const toggleSlotClient = (clientId: string) => {
    setSlotSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  };

  const toggleCycleClient = (clientId: string) => {
    setCycleSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  };

  const handleGenerateSlotMessage = async () => {
    if (!selectedSlot || slotPreviewClientIds.length === 0) return;
    const result = await generateSlotMessage.mutateAsync({
      campaignType: 'slot_fill',
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      clientIds: slotPreviewClientIds,
      tone: slotTone,
    });
    setSlotMessage(result.message);
  };

  const handleGenerateCycleMessage = async () => {
    if (cyclePreviewClientIds.length === 0 || cycleSlotPreview.length === 0) return;
    const firstSlot = cycleSlotPreview[0];
    const result = await generateCycleMessage.mutateAsync({
      campaignType: 'cycle_followup',
      date: firstSlot?.date || selectedDate,
      startTime: firstSlot?.startTime || '09:00',
      endTime: firstSlot?.endTime || '09:30',
      clientIds: cyclePreviewClientIds,
      tone: cycleTone,
      slotOptions: cycleSlotPreview,
    });
    setCycleMessage(result.message);
  };

  const handleSendSlotCampaign = async () => {
    if (!selectedSlot || !slotMessage.trim()) return;
    await sendSlotCampaign.mutateAsync({
      campaignType: 'slot_fill',
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      clientIds: slotAudienceMode === 'all' ? [] : slotSelectedClientIds,
      includeAllClients: slotAudienceMode === 'all',
      tone: slotTone,
      message: slotMessage.trim(),
    });
  };

  const handleSendCycleCampaign = async () => {
    const firstSlot = cycleSlotPreview[0];
    if (!cycleMessage.trim() || !firstSlot) return;
    await sendCycleCampaign.mutateAsync({
      campaignType: 'cycle_followup',
      date: firstSlot.date,
      startTime: firstSlot.startTime,
      endTime: firstSlot.endTime,
      clientIds: cycleAudienceMode === 'all' ? [] : cycleSelectedClientIds,
      includeAllClients: cycleAudienceMode === 'all',
      tone: cycleTone,
      slotOptions: cycleSlotPreview,
      message: cycleMessage.trim(),
    });
  };

  return (
    <div className="page animate-fade-in">
      <PageHeader
        title={intl.formatMessage({ id: 'rebooking.title' })}
        subtitle={intl.formatMessage({ id: 'rebooking.subtitle' })}
        action={
          <Badge variant="secondary">
            <Clock3 size={14} /> {data?.bestSendTime || '18:00'}
          </Badge>
        }
      />

      <div className={styles.datePickerWrap}>
        <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} daysAhead={30} />
      </div>

      {isLoading && <SkeletonList count={4} />}

      {!isLoading && data && (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.emptySlots' })}</h2>
              <span className={styles.sectionMeta}>{formatDateLabel(selectedDate)}</span>
            </div>
            {!availableSlots.length ? (
              <EmptyState
                icon={<CalendarClock size={40} />}
                title={intl.formatMessage({ id: 'rebooking.noEmptySlotsForDate' })}
              />
            ) : (
              <>
                <div className={styles.slotGrid}>
                  {availableSlots.map((slot) => (
                    <Card
                      key={`${slot.date}-${slot.startTime}`}
                      className={`${styles.slotCard} ${
                        selectedSlotKey === `${slot.date}-${slot.startTime}`
                          ? styles.slotSelected
                          : ''
                      }`}
                      onClick={() => setSelectedSlotKey(`${slot.date}-${slot.startTime}`)}
                    >
                      <div className={styles.slotTime}>
                        {slot.startTime} — {slot.endTime}
                      </div>
                      <div className={styles.slotMeta}>
                        {intl.formatMessage(
                          { id: 'rebooking.slotCount' },
                          { count: slot.freeSlotCount },
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                {selectedSlot && (
                  <Card className={styles.campaignCard}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.subTitle}>
                          {intl.formatMessage({ id: 'rebooking.slotPromoTitle' })}
                        </h3>
                        <p className={styles.helperText}>
                          {formatDateLabel(selectedSlot.date)} · {selectedSlot.startTime} —{' '}
                          {selectedSlot.endTime}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {intl.formatMessage(
                          { id: 'rebooking.selectedClients' },
                          { count: slotSelectedCount },
                        )}
                      </Badge>
                    </div>

                    <div className={styles.modeRow}>
                      <Button
                        size="sm"
                        variant={slotAudienceMode === 'all' ? 'primary' : 'secondary'}
                        onClick={() => setSlotAudienceMode('all')}
                      >
                        {intl.formatMessage({ id: 'rebooking.selectAllClients' })}
                      </Button>
                      <Button
                        size="sm"
                        variant={slotAudienceMode === 'selected' ? 'primary' : 'secondary'}
                        onClick={() => setSlotAudienceMode('selected')}
                      >
                        {intl.formatMessage({ id: 'rebooking.selectManually' })}
                      </Button>
                    </div>

                    {slotAudienceMode === 'selected' && (
                      <div className={styles.clientListCompact}>
                        {clientsLoading && <SkeletonList count={3} />}
                        {!clientsLoading &&
                          allClients.map((client) => (
                            <SelectableClientCard
                              key={client.id}
                              client={client}
                              checked={slotSelectedClientIds.includes(client.id)}
                              onToggle={() => toggleSlotClient(client.id)}
                            />
                          ))}
                      </div>
                    )}

                    <TonePicker tone={slotTone} onChange={setSlotTone} />

                    <Button
                      fullWidth
                      onClick={handleGenerateSlotMessage}
                      disabled={!selectedSlot || slotPreviewClientIds.length === 0}
                      loading={generateSlotMessage.isPending}
                    >
                      {intl.formatMessage({ id: 'rebooking.generateText' })}
                    </Button>

                    <div className={styles.messageBox}>
                      <label className={styles.messageLabel}>
                        {intl.formatMessage({ id: 'rebooking.messageLabel' })}
                      </label>
                      <textarea
                        className={styles.textarea}
                        value={slotMessage}
                        onChange={(event) => setSlotMessage(event.target.value)}
                        rows={5}
                      />
                    </div>

                    <Button
                      fullWidth
                      onClick={handleSendSlotCampaign}
                      disabled={
                        !selectedSlot ||
                        !slotMessage.trim() ||
                        (slotAudienceMode === 'all'
                          ? allClients.length === 0
                          : slotSelectedClientIds.length === 0)
                      }
                      loading={sendSlotCampaign.isPending}
                      icon={<Send size={18} />}
                    >
                      {intl.formatMessage({ id: 'rebooking.sendSlotPromo' })}
                    </Button>
                  </Card>
                )}
              </>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.recommendations' })}</h2>
              <span className={styles.sectionMeta}>
                {intl.formatMessage(
                  { id: 'rebooking.defaultCycleDays' },
                  { count: data.defaultCycleDays },
                )}
              </span>
            </div>

            <Card className={styles.campaignCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3 className={styles.subTitle}>
                    {intl.formatMessage({ id: 'rebooking.recommendations' })}
                  </h3>
                  <p className={styles.helperText}>
                    {intl.formatMessage({ id: 'rebooking.cyclePromoHint' })}
                  </p>
                </div>
                <Badge variant="secondary">
                  {intl.formatMessage(
                    { id: 'rebooking.selectedClients' },
                    { count: cycleSelectedCount },
                  )}
                </Badge>
              </div>

              <div className={styles.modeRow}>
                <Button
                  size="sm"
                  variant={cycleAudienceMode === 'all' ? 'primary' : 'secondary'}
                  onClick={() => setCycleAudienceMode('all')}
                >
                  {intl.formatMessage({ id: 'rebooking.selectAllDueClients' })}
                </Button>
                <Button
                  size="sm"
                  variant={cycleAudienceMode === 'selected' ? 'primary' : 'secondary'}
                  onClick={() => setCycleAudienceMode('selected')}
                >
                  {intl.formatMessage({ id: 'rebooking.selectManually' })}
                </Button>
              </div>

              <div className={styles.previewBlock}>
                <div className={styles.previewTitle}>
                  {intl.formatMessage({ id: 'rebooking.availableDatesPreview' })}
                </div>
                <div className={styles.previewDates}>
                  {groupSlotsByDate(cycleSlotPreview).map(([date, slots]) => (
                    <Card key={date} className={styles.previewDateCard}>
                      <div className={styles.previewDate}>{formatDateLabel(date)}</div>
                      <div className={styles.previewTimeRow}>
                        {slots.map((slot) => (
                          <button
                            key={`${slot.date}-${slot.startTime}`}
                            className={styles.previewTimeChip}
                          >
                            {slot.startTime}
                          </button>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {cycleAudienceMode === 'selected' && (
                <>
                  <div className={styles.filterRow}>
                    {FILTERS.map((filter) => (
                      <button
                        key={filter}
                        className={`${styles.filterChip} ${segmentFilter === filter ? styles.filterChipActive : ''}`}
                        onClick={() => setSegmentFilter(filter)}
                      >
                        {intl.formatMessage({
                          id:
                            filter === 'all'
                              ? 'rebooking.filter.all'
                              : `rebooking.filter.${filter}`,
                        })}
                      </button>
                    ))}
                  </div>

                  {filteredRecommendations.length === 0 ? (
                    <EmptyState
                      icon={<Sparkles size={40} />}
                      title={intl.formatMessage({ id: 'rebooking.noRecommendations' })}
                    />
                  ) : (
                    <div className={styles.clientList}>
                      {filteredRecommendations.map((item) => (
                        <RecommendationCard
                          key={item.clientId}
                          item={item}
                          checked={cycleSelectedClientIds.includes(item.clientId)}
                          onToggle={() => toggleCycleClient(item.clientId)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              <TonePicker tone={cycleTone} onChange={setCycleTone} />

              <Button
                fullWidth
                onClick={handleGenerateCycleMessage}
                disabled={cyclePreviewClientIds.length === 0 || cycleSlotPreview.length === 0}
                loading={generateCycleMessage.isPending}
              >
                {intl.formatMessage({ id: 'rebooking.generateText' })}
              </Button>

              <div className={styles.messageBox}>
                <label className={styles.messageLabel}>
                  {intl.formatMessage({ id: 'rebooking.messageLabel' })}
                </label>
                <textarea
                  className={styles.textarea}
                  value={cycleMessage}
                  onChange={(event) => setCycleMessage(event.target.value)}
                  rows={6}
                />
              </div>

              <Button
                fullWidth
                onClick={handleSendCycleCampaign}
                disabled={
                  !cycleMessage.trim() ||
                  cycleSlotPreview.length === 0 ||
                  (cycleAudienceMode === 'all'
                    ? (data?.recommendations.length || 0) === 0
                    : cycleSelectedClientIds.length === 0)
                }
                loading={sendCycleCampaign.isPending}
                icon={<Send size={18} />}
              >
                {intl.formatMessage({ id: 'rebooking.sendCyclePromo' })}
              </Button>
            </Card>
          </section>

          <section className={styles.section}>
            <Card className={styles.occupancyCard}>
              <div className={styles.occupancyTop}>
                <div>
                  <div className={styles.occupancyLabel}>
                    {intl.formatMessage({ id: 'rebooking.occupancy' })}
                  </div>
                  <div className={styles.occupancyValue}>{data.kpis.occupancyRate}%</div>
                </div>
                <CalendarClock size={22} />
              </div>
              {intl.formatMessage(
                { id: 'rebooking.occupancySummary' },
                {
                  booked: data.heatmap.reduce((sum, day) => sum + day.bookedSlots, 0),
                  total: data.heatmap.reduce((sum, day) => sum + day.totalSlots, 0),
                },
              )}
            </Card>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.sendLog' })}</h2>
            </div>
            <div className={styles.logList}>
              {data.sendLog.map((logItem) => (
                <Card key={logItem.id} className={styles.logCard}>
                  <div className={styles.logTop}>
                    <div>
                      <div className={styles.slotTime}>
                        {formatDateLabel(logItem.date)} · {logItem.startTime} — {logItem.endTime}
                      </div>
                      <div className={styles.slotMeta}>
                        {new Date(logItem.createdAt).toLocaleString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <Badge variant={logItem.status === 'filled' ? 'success' : 'secondary'}>
                      {logItem.status === 'filled'
                        ? intl.formatMessage({ id: 'rebooking.logFilled' })
                        : intl.formatMessage({ id: 'rebooking.logActive' })}
                    </Badge>
                  </div>
                  <div className={styles.logStats}>
                    <span>
                      {intl.formatMessage(
                        { id: 'rebooking.logSent' },
                        { count: logItem.sentCount },
                      )}
                    </span>
                    <span>
                      {intl.formatMessage(
                        { id: 'rebooking.logBooked' },
                        { count: logItem.bookedCount },
                      )}
                    </span>
                    <span>
                      {intl.formatMessage(
                        { id: 'rebooking.logClosed' },
                        { count: logItem.closedCount },
                      )}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function buildDefaultSlotMessage(slot: RebookingEmptySlot) {
  return `Звільнилося вікно ${formatDateLabel(slot.date)} з ${slot.startTime} до ${slot.endTime}. Якщо тобі зручно — переходь та записуйся 💅`;
}

function buildDefaultCycleMessage(defaultCycleDays: number) {
  return `Минуло вже близько ${defaultCycleDays} днів від минулого візиту. Час зробити новий запис ✨ Переходь та обирай зручну дату.`;
}

function groupSlotsByDate(slots: RebookingEmptySlot[]) {
  const grouped = new Map<string, RebookingEmptySlot[]>();

  slots.forEach((slot) => {
    const list = grouped.get(slot.date) || [];
    list.push(slot);
    grouped.set(slot.date, list);
  });

  return [...grouped.entries()];
}

function TonePicker({
  tone,
  onChange,
}: {
  tone: 'soft' | 'friendly';
  onChange: (tone: 'soft' | 'friendly') => void;
}) {
  const intl = useIntl();

  return (
    <div className={styles.toneRow}>
      <Button
        variant={tone === 'soft' ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => onChange('soft')}
      >
        {intl.formatMessage({ id: 'rebooking.toneSoft' })}
      </Button>
      <Button
        variant={tone === 'friendly' ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => onChange('friendly')}
      >
        {intl.formatMessage({ id: 'rebooking.toneFriendly' })}
      </Button>
    </div>
  );
}

function SelectableClientCard({
  client,
  checked,
  onToggle,
}: {
  client: Client;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className={styles.clientCardCompact} onClick={onToggle}>
      <label className={styles.checkboxWrap}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
        />
        <span className={styles.clientName}>
          {client.firstName} {client.lastName || ''}
        </span>
      </label>
    </Card>
  );
}

function RecommendationCard({
  item,
  checked,
  onToggle,
}: {
  item: RebookingRecommendation;
  checked: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();

  return (
    <Card className={styles.clientCard} onClick={onToggle}>
      <div className={styles.clientCardTop}>
        <label className={styles.checkboxWrap}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
          />
          <span className={styles.clientName}>
            {item.firstName} {item.lastName || ''}
          </span>
        </label>
        <Badge
          variant={
            item.priority === 'high'
              ? 'success'
              : item.priority === 'medium'
                ? 'warning'
                : 'secondary'
          }
        >
          {item.priority.toUpperCase()}
        </Badge>
      </div>
      <p className={styles.reason}>{item.reason}</p>
      <div className={styles.segmentRow}>
        {item.segments.map((segment) => (
          <Badge key={segment} variant="secondary">
            {intl.formatMessage({ id: `rebooking.segment.${segment}` })}
          </Badge>
        ))}
      </div>
      {item.favoriteService && (
        <div className={styles.metaLine}>
          {intl.formatMessage(
            { id: 'rebooking.favoriteService' },
            { service: item.favoriteService.name },
          )}
        </div>
      )}
      <div className={styles.metaLine}>
        {intl.formatMessage(
          { id: 'rebooking.expectedReturn' },
          {
            date: new Date(item.expectedReturnDate).toLocaleDateString('uk-UA', {
              day: 'numeric',
              month: 'short',
            }),
          },
        )}
      </div>
    </Card>
  );
}
