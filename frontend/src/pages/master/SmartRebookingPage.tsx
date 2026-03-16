import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Clock3, Sparkles, Send, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  PageHeader,
  SkeletonList,
  StatCard,
  StatGrid,
} from '@/components/ui';
import {
  useGenerateRebookingMessage,
  useRebookingOverview,
  useSendRebookingCampaign,
} from '@/hooks/useRebooking';
import type { RebookingRecommendation } from '@/types';
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
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [tone, setTone] = useState<'soft' | 'friendly'>('friendly');
  const [message, setMessage] = useState('');

  const { data, isLoading } = useRebookingOverview(selectedDate);
  const generateMessage = useGenerateRebookingMessage();
  const sendCampaign = useSendRebookingCampaign();

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', selectedDate);
      return next;
    });
  }, [selectedDate, setSearchParams]);

  const availableSlots = useMemo(
    () => (data?.emptySlots || []).filter((slot) => slot.date === selectedDate),
    [data?.emptySlots, selectedDate],
  );

  const selectedSlot = useMemo(
    () =>
      availableSlots.find((slot) => `${slot.date}-${slot.startTime}` === selectedSlotKey) || null,
    [availableSlots, selectedSlotKey],
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
    const topMatches = filteredRecommendations.slice(0, 5).map((item) => item.clientId);
    setSelectedClientIds(topMatches);
  }, [filteredRecommendations, selectedSlotKey]);

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  };

  const handleGenerate = async () => {
    if (!selectedSlot || selectedClientIds.length === 0) return;
    const result = await generateMessage.mutateAsync({
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      clientIds: selectedClientIds,
      tone,
    });
    setMessage(result.message);
  };

  const handleSend = async () => {
    if (!selectedSlot || !message.trim() || selectedClientIds.length === 0) return;
    await sendCampaign.mutateAsync({
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      clientIds: selectedClientIds,
      tone,
      message: message.trim(),
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
          <StatGrid columns={3}>
            <StatCard
              value={`${data.kpis.repeatClientRate}%`}
              label={intl.formatMessage({ id: 'rebooking.repeatClients' })}
              icon={<Users size={18} />}
            />
            <StatCard
              value={`${data.kpis.occupancyRate}%`}
              label={intl.formatMessage({ id: 'rebooking.occupancy' })}
              icon={<CalendarClock size={18} />}
            />
            <StatCard
              value={`${(data.kpis.averageLtv / 100).toFixed(0)}₴`}
              label={intl.formatMessage({ id: 'rebooking.averageLtv' })}
              icon={<Sparkles size={18} />}
            />
          </StatGrid>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.emptySlots' })}</h2>
              <span className={styles.sectionMeta}>{formatDateLabel(selectedDate)}</span>
            </div>
            <div className={styles.slotGrid}>
              {availableSlots.map((slot) => (
                <Card
                  key={`${slot.date}-${slot.startTime}`}
                  className={`${styles.slotCard} ${
                    selectedSlotKey === `${slot.date}-${slot.startTime}` ? styles.slotSelected : ''
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
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.recommendations' })}</h2>
              <span className={styles.sectionMeta}>
                {intl.formatMessage(
                  { id: 'rebooking.selectedClients' },
                  { count: selectedClientIds.length },
                )}
              </span>
            </div>

            <div className={styles.filterRow}>
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  className={`${styles.filterChip} ${segmentFilter === filter ? styles.filterChipActive : ''}`}
                  onClick={() => setSegmentFilter(filter)}
                >
                  {intl.formatMessage({
                    id: filter === 'all' ? 'rebooking.filter.all' : `rebooking.filter.${filter}`,
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
                    checked={selectedClientIds.includes(item.clientId)}
                    onToggle={() => toggleClient(item.clientId)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.heatmap' })}</h2>
            </div>
            <div className={styles.heatmapGrid}>
              {data.heatmap.slice(0, 7).map((day) => (
                <Card key={day.date} className={styles.heatmapCard}>
                  <div className={styles.heatmapDate}>{formatDateLabel(day.date)}</div>
                  <div className={styles.heatmapValue}>{day.occupancyRate}%</div>
                  <div className={styles.heatmapMeta}>
                    {day.bookedSlots}/{day.totalSlots}
                  </div>
                </Card>
              ))}
            </div>
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

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{intl.formatMessage({ id: 'rebooking.messageLabel' })}</h2>
            </div>

            <div className={styles.toneRow}>
              <Button
                variant={tone === 'soft' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setTone('soft')}
              >
                {intl.formatMessage({ id: 'rebooking.toneSoft' })}
              </Button>
              <Button
                variant={tone === 'friendly' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setTone('friendly')}
              >
                {intl.formatMessage({ id: 'rebooking.toneFriendly' })}
              </Button>
            </div>

            <Button
              fullWidth
              onClick={handleGenerate}
              disabled={!selectedSlot || selectedClientIds.length === 0}
              loading={generateMessage.isPending}
            >
              {intl.formatMessage({ id: 'rebooking.generateText' })}
            </Button>

            <div className={styles.messageBox}>
              <label className={styles.messageLabel}>
                {intl.formatMessage({ id: 'rebooking.messageLabel' })}
              </label>
              <textarea
                className={styles.textarea}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
              />
            </div>

            <Button
              fullWidth
              onClick={handleSend}
              disabled={!selectedSlot || !message.trim() || selectedClientIds.length === 0}
              loading={sendCampaign.isPending}
              icon={<Send size={18} />}
            >
              {intl.formatMessage({ id: 'rebooking.sendAll' })}
            </Button>
          </section>
        </>
      )}
    </div>
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
