import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Clock3, History, Send, Sparkles, Users, Wand2 } from 'lucide-react';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  DatePicker,
  EmptyState,
  PageHeader,
  SkeletonList,
  Tabs,
} from '@/components/ui';
import { useClients, useReturnReminders } from '@/hooks';
import { ApiRequestError } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import {
  useGenerateRebookingMessage,
  useRebookingOverview,
  useSendRebookingCampaign,
} from '@/hooks/useRebooking';
import type {
  Client,
  RebookingCampaignType,
  RebookingEmptySlot,
  RebookingRecommendation,
} from '@/types';
import styles from './SmartRebookingPage.module.css';

const MAX_SLOT_RECIPIENTS = 8;
const MAX_CYCLE_SLOT_OPTIONS = 3;

type PickerMode = 'slot' | 'cycle' | null;

export function SmartRebookingPage() {
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const requestedSlot = searchParams.get('slot');

  const [selectedDate, setSelectedDate] = useState(
    searchParams.get('date') || formatDateKey(new Date()),
  );
  const [activeFlow, setActiveFlow] = useState<RebookingCampaignType>(
    requestedMode === 'cycle' ? 'cycle_followup' : 'slot_fill',
  );
  const [selectedSlotKey, setSelectedSlotKey] = useState('');
  const [slotSelectedClientIds, setSlotSelectedClientIds] = useState<string[]>([]);
  const [cycleSelectedClientIds, setCycleSelectedClientIds] = useState<string[]>([]);
  const [cycleSelectedSlotKeys, setCycleSelectedSlotKeys] = useState<string[]>([]);
  const [slotTone, setSlotTone] = useState<'soft' | 'friendly'>('friendly');
  const [cycleTone, setCycleTone] = useState<'soft' | 'friendly'>('friendly');
  const [slotMessage, setSlotMessage] = useState('');
  const [cycleMessage, setCycleMessage] = useState('');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lastSent, setLastSent] = useState<{
    type: RebookingCampaignType;
    count: number;
  } | null>(null);

  const { data, isLoading } = useRebookingOverview(selectedDate);
  const { data: clientsData, isLoading: clientsLoading } = useClients();
  const { data: remindersData, isLoading: remindersLoading } = useReturnReminders();
  const generateSlotMessage = useGenerateRebookingMessage();
  const generateCycleMessage = useGenerateRebookingMessage();
  const sendSlotCampaign = useSendRebookingCampaign();
  const sendCycleCampaign = useSendRebookingCampaign();

  const allClients = useMemo(() => clientsData?.items || [], [clientsData?.items]);
  const returnReminders = useMemo(() => remindersData || [], [remindersData]);

  const telegramClients = useMemo(
    () => allClients.filter((client) => Boolean(client.telegramId)),
    [allClients],
  );

  const availableSlots = useMemo(
    () => (data?.emptySlots || []).filter((slot) => slot.date === selectedDate),
    [data?.emptySlots, selectedDate],
  );

  const selectedSlot = useMemo(
    () =>
      availableSlots.find((slot) => `${slot.date}-${slot.startTime}` === selectedSlotKey) || null,
    [availableSlots, selectedSlotKey],
  );

  const cycleSlotPool = useMemo(() => data?.emptySlots || [], [data?.emptySlots]);

  const cycleSlotOptions = useMemo(
    () =>
      cycleSelectedSlotKeys
        .map(
          (key) => cycleSlotPool.find((slot) => `${slot.date}-${slot.startTime}` === key) || null,
        )
        .filter((slot): slot is RebookingEmptySlot => Boolean(slot)),
    [cycleSelectedSlotKeys, cycleSlotPool],
  );

  const cycleCampaignOptions = useMemo(
    () => cycleSlotOptions.map(toCampaignSlotOption),
    [cycleSlotOptions],
  );

  const slotSuggestedRecipients = useMemo(
    () => buildSlotSuggestions(selectedSlot, data?.recommendations || [], telegramClients),
    [selectedSlot, data?.recommendations, telegramClients],
  );

  const slotCampaignOptions = useMemo(
    () => buildSlotCampaignOptions(selectedSlot, data?.emptySlots || []),
    [selectedSlot, data?.emptySlots],
  );

  const slotSuggestedIds = useMemo(
    () => slotSuggestedRecipients.map((item) => item.clientId),
    [slotSuggestedRecipients],
  );

  const slotSelectedClients = useMemo(
    () => allClients.filter((client) => slotSelectedClientIds.includes(client.id)),
    [allClients, slotSelectedClientIds],
  );

  const returnReminderMap = useMemo(
    () => new Map(returnReminders.map((item) => [item.id, item])),
    [returnReminders],
  );

  const cycleSelectedRecipients = useMemo(
    () =>
      cycleSelectedClientIds
        .map((clientId): RebookingRecommendation | null => {
          const reminder = returnReminderMap.get(clientId);
          if (reminder) {
            return {
              clientId: reminder.id,
              firstName: reminder.firstName,
              lastName: reminder.lastName,
              telegramId: reminder.telegramId || null,
              lastVisitAt: reminder.lastVisitAt,
              expectedReturnDate: reminder.expectedReturnDate,
              averageCycleDays: data?.defaultCycleDays || 21,
              visitCount: reminder.stats?.totalBookings || 0,
              ltv: reminder.stats?.totalSpent || 0,
              priority: 'medium' as const,
              priorityScore: 0,
              reason: buildReturnReminderReason(reminder, intl),
              segments: [],
              favoriteService: null,
            };
          }

          const client = allClients.find((entry) => entry.id === clientId);
          if (!client) {
            return null;
          }

          return {
            clientId: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            telegramId: client.telegramId || null,
            lastVisitAt: client.lastVisitAt,
            expectedReturnDate: selectedDate,
            averageCycleDays: data?.defaultCycleDays || 0,
            visitCount: client.stats?.totalBookings || 0,
            ltv: client.stats?.totalSpent || 0,
            priority: 'low' as const,
            priorityScore: 0,
            reason: client.telegramId
              ? intl.formatMessage({ id: 'rebooking.manualRecipient' })
              : intl.formatMessage({ id: 'rebooking.manualRecipientNoTelegram' }),
            segments: [],
            favoriteService: null,
          };
        })
        .filter((item): item is RebookingRecommendation => Boolean(item)),
    [
      allClients,
      cycleSelectedClientIds,
      data?.defaultCycleDays,
      intl,
      returnReminderMap,
      selectedDate,
    ],
  );

  const slotPreviewIds = useMemo(() => slotSelectedClientIds.slice(0, 3), [slotSelectedClientIds]);
  const cyclePreviewIds = useMemo(
    () => cycleSelectedClientIds.slice(0, 3),
    [cycleSelectedClientIds],
  );

  const slotPickerItems = useMemo(() => {
    const normalizedSearch = pickerSearch.trim().toLowerCase();
    const suggestionMap = new Map(
      slotSuggestedRecipients.map((item) => [item.clientId, item.reason]),
    );

    return allClients
      .filter((client) => {
        if (!normalizedSearch) return true;
        const fullName = `${client.firstName} ${client.lastName || ''}`.toLowerCase();
        return fullName.includes(normalizedSearch);
      })
      .map((client) => ({
        id: client.id,
        title: `${client.firstName} ${client.lastName || ''}`.trim(),
        subtitle: client.telegramId
          ? suggestionMap.get(client.id) || intl.formatMessage({ id: 'rebooking.manualRecipient' })
          : intl.formatMessage({ id: 'rebooking.manualRecipientNoTelegram' }),
        checked: slotSelectedClientIds.includes(client.id),
        disabled: !client.telegramId,
        onToggle: () => toggleArrayValue(client.id, setSlotSelectedClientIds),
      }));
  }, [allClients, intl, pickerSearch, slotSelectedClientIds, slotSuggestedRecipients]);

  const cyclePickerItems = useMemo(() => {
    const normalizedSearch = pickerSearch.trim().toLowerCase();
    const reminderIds = new Set(returnReminders.map((item) => item.id));

    return allClients
      .filter((client) => {
        if (!normalizedSearch) return true;
        const reminder = returnReminderMap.get(client.id);
        const fullName = `${client.firstName} ${client.lastName || ''}`.toLowerCase();
        return (
          fullName.includes(normalizedSearch) ||
          buildReturnReminderReason(reminder, intl).toLowerCase().includes(normalizedSearch)
        );
      })
      .map((client) => {
        const reminder = returnReminderMap.get(client.id);

        return {
          id: client.id,
          title: `${client.firstName} ${client.lastName || ''}`.trim(),
          subtitle: client.telegramId
            ? reminder
              ? buildReturnReminderReason(reminder, intl)
              : intl.formatMessage({ id: 'rebooking.manualRecipient' })
            : intl.formatMessage({ id: 'rebooking.manualRecipientNoTelegram' }),
          checked: cycleSelectedClientIds.includes(client.id),
          badge: reminder
            ? reminder.daysUntilReturn <= 1
              ? ('high' as const)
              : ('medium' as const)
            : undefined,
          muted: !reminderIds.has(client.id),
          disabled: !client.telegramId,
          onToggle: () => toggleArrayValue(client.id, setCycleSelectedClientIds),
        };
      });
  }, [allClients, cycleSelectedClientIds, intl, pickerSearch, returnReminderMap, returnReminders]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', selectedDate);
      next.set('mode', activeFlow === 'slot_fill' ? 'slot' : 'cycle');
      if (selectedSlotKey) {
        next.set('slot', selectedSlotKey.split('-').slice(1).join('-'));
      } else {
        next.delete('slot');
      }
      return next;
    });
  }, [activeFlow, selectedDate, selectedSlotKey, setSearchParams]);

  useEffect(() => {
    if (!availableSlots.length) {
      setSelectedSlotKey('');
      return;
    }

    const requestedSlotKey = requestedSlot ? `${selectedDate}-${requestedSlot}` : null;
    if (
      requestedSlotKey &&
      availableSlots.some((slot) => `${slot.date}-${slot.startTime}` === requestedSlotKey)
    ) {
      setSelectedSlotKey(requestedSlotKey);
      return;
    }

    if (!availableSlots.some((slot) => `${slot.date}-${slot.startTime}` === selectedSlotKey)) {
      const firstSlot = availableSlots[0];
      if (firstSlot) {
        setSelectedSlotKey(`${firstSlot.date}-${firstSlot.startTime}`);
      }
    }
  }, [availableSlots, requestedSlot, selectedDate, selectedSlotKey]);

  useEffect(() => {
    if (cycleSlotPool.length === 0) {
      setCycleSelectedSlotKeys([]);
      return;
    }

    const validKeys = cycleSelectedSlotKeys.filter((key) =>
      cycleSlotPool.some((slot) => `${slot.date}-${slot.startTime}` === key),
    );

    if (validKeys.length > 0) {
      if (validKeys.length !== cycleSelectedSlotKeys.length) {
        setCycleSelectedSlotKeys(validKeys);
      }
      return;
    }

    setCycleSelectedSlotKeys(
      cycleSlotPool
        .slice(0, MAX_CYCLE_SLOT_OPTIONS)
        .map((slot) => `${slot.date}-${slot.startTime}`),
    );
  }, [cycleSelectedSlotKeys, cycleSlotPool]);

  useEffect(() => {
    setSlotSelectedClientIds(slotSuggestedIds);
  }, [slotSuggestedIds]);

  useEffect(() => {
    const reminderIds = returnReminders.map((item) => item.id);

    setCycleSelectedClientIds((prev) => {
      const validIds = prev.filter((clientId) =>
        allClients.some((client) => client.id === clientId),
      );
      if (validIds.length > 0) {
        return validIds;
      }

      return reminderIds;
    });
  }, [allClients, returnReminders]);

  useEffect(() => {
    setPickerSearch('');
  }, [pickerMode]);

  useEffect(() => {
    if (!selectedSlot) {
      setSlotMessage('');
      return;
    }

    setSlotMessage(buildDefaultSlotMessage(selectedSlot));
  }, [selectedSlotKey]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setCycleMessage(
      buildDefaultCycleMessage({
        defaultCycleDays: data.defaultCycleDays,
        slotOptions: cycleSlotOptions,
      }),
    );
  }, [cycleSelectedSlotKeys, data]);

  const slotDisabled = !selectedSlot || slotSelectedClientIds.length === 0 || !slotMessage.trim();
  const cycleDisabled =
    cycleSelectedClientIds.length === 0 || cycleSlotOptions.length === 0 || !cycleMessage.trim();

  const handleImproveSlotMessage = async () => {
    if (!selectedSlot || slotPreviewIds.length === 0) return;

    const result = await generateSlotMessage.mutateAsync({
      campaignType: 'slot_fill',
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      clientIds: slotPreviewIds,
      tone: slotTone,
    });

    setSlotMessage(result.message);
  };

  const handleImproveCycleMessage = async () => {
    const firstSlot = cycleSlotOptions[0];
    if (!firstSlot || cyclePreviewIds.length === 0) return;

    const result = await generateCycleMessage.mutateAsync({
      campaignType: 'cycle_followup',
      date: firstSlot.date,
      startTime: firstSlot.startTime,
      endTime: firstSlot.endTime,
      clientIds: cyclePreviewIds,
      tone: cycleTone,
      slotOptions: cycleCampaignOptions,
    });

    setCycleMessage(result.message);
  };

  const handleSendSlotCampaign = async () => {
    if (!selectedSlot || slotDisabled) return;

    try {
      const result = await sendSlotCampaign.mutateAsync({
        campaignType: 'slot_fill',
        date: selectedSlot.date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        clientIds: slotSelectedClientIds,
        tone: slotTone,
        slotOptions: slotCampaignOptions,
        message: slotMessage.trim(),
      });

      setLastSent({ type: 'slot_fill', count: result.sentCount });
    } catch (error) {
      showPromoError(error, intl);
    }
  };

  const handleSendCycleCampaign = async () => {
    const firstSlot = cycleSlotOptions[0];
    if (!firstSlot || cycleDisabled) return;

    try {
      const result = await sendCycleCampaign.mutateAsync({
        campaignType: 'cycle_followup',
        date: firstSlot.date,
        startTime: firstSlot.startTime,
        endTime: firstSlot.endTime,
        clientIds: cycleSelectedClientIds,
        tone: cycleTone,
        slotOptions: cycleCampaignOptions,
        message: cycleMessage.trim(),
      });

      setLastSent({ type: 'cycle_followup', count: result.sentCount });
    } catch (error) {
      showPromoError(error, intl);
    }
  };

  return (
    <div className="page animate-fade-in">
      <PageHeader
        title={intl.formatMessage({ id: 'rebooking.title' })}
        subtitle={intl.formatMessage({ id: 'rebooking.subtitle' })}
        action={
          <Badge variant="secondary" className={styles.bestTimeBadge}>
            <Clock3 size={14} className={styles.bestTimeIcon} />
            <span className={styles.bestTimeText}>
              {intl.formatMessage(
                { id: 'rebooking.bestTimeHint' },
                { time: data?.bestSendTime || '18:00' },
              )}
            </span>
          </Badge>
        }
      />

      <div className={styles.datePickerWrap}>
        <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} daysAhead={30} />
      </div>

      <Tabs
        tabs={[
          { id: 'slot_fill', label: intl.formatMessage({ id: 'rebooking.flow.slot' }) },
          { id: 'cycle_followup', label: intl.formatMessage({ id: 'rebooking.flow.cycle' }) },
        ]}
        activeId={activeFlow}
        onChange={(id) => setActiveFlow(id as RebookingCampaignType)}
      />

      {isLoading && <SkeletonList count={4} />}

      {!isLoading && data && (
        <>
          {lastSent && (
            <Card className={styles.resultCard}>
              <div className={styles.resultTitle}>
                <Send size={16} />
                {intl.formatMessage({ id: 'rebooking.sendResult' }, { count: lastSent.count })}
              </div>
              <div className={styles.helperText}>
                {intl.formatMessage({ id: `rebooking.logType.${lastSent.type}` })}
              </div>
            </Card>
          )}

          {activeFlow === 'slot_fill' ? (
            <>
              <section className={styles.section}>
                <Card className={styles.stepCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2>{intl.formatMessage({ id: 'rebooking.step.slot' })}</h2>
                      <p className={styles.helperText}>
                        {intl.formatMessage({ id: 'rebooking.availableSlotsHint' })}
                      </p>
                    </div>
                    <Badge variant="secondary">{formatDateLabel(selectedDate)}</Badge>
                  </div>

                  {!availableSlots.length ? (
                    <EmptyState
                      icon={<CalendarClock size={40} />}
                      title={intl.formatMessage({ id: 'rebooking.noEmptySlotsForDate' })}
                    />
                  ) : (
                    <div className={styles.slotGrid}>
                      {availableSlots.map((slot) => {
                        const isSelected = selectedSlotKey === `${slot.date}-${slot.startTime}`;
                        return (
                          <Card
                            key={`${slot.date}-${slot.startTime}`}
                            className={`${styles.slotCard} ${isSelected ? styles.slotSelected : ''}`}
                            onClick={() => setSelectedSlotKey(`${slot.date}-${slot.startTime}`)}
                          >
                            <div className={styles.slotCardTop}>
                              <div className={styles.slotTime}>
                                {slot.startTime} — {slot.endTime}
                              </div>
                              {isSelected && (
                                <Badge variant="primary">
                                  {intl.formatMessage({ id: 'rebooking.slotChosen' })}
                                </Badge>
                              )}
                            </div>
                            <div className={styles.slotMeta}>
                              {intl.formatMessage(
                                { id: 'rebooking.slotCount' },
                                { count: slot.freeSlotCount },
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </section>

              {selectedSlot && (
                <>
                  <section className={styles.section}>
                    <Card className={styles.stepCard}>
                      <div className={styles.sectionHeader}>
                        <div>
                          <h2>{intl.formatMessage({ id: 'rebooking.step.audience' })}</h2>
                          <p className={styles.helperText}>
                            {intl.formatMessage({ id: 'rebooking.slotSuggestedHint' })}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {intl.formatMessage(
                            { id: 'rebooking.selectionSummary' },
                            { count: slotSelectedClientIds.length },
                          )}
                        </Badge>
                      </div>

                      <Card className={styles.summaryCard}>
                        <div className={styles.summaryTitle}>
                          <Sparkles size={16} />
                          {intl.formatMessage({ id: 'rebooking.suggestedAudience' })}
                        </div>
                        <div className={styles.summaryText}>
                          {intl.formatMessage(
                            { id: 'rebooking.slotSummary' },
                            {
                              date: formatDateLabel(selectedSlot.date),
                              time: `${selectedSlot.startTime} — ${selectedSlot.endTime}`,
                            },
                          )}
                        </div>
                        <div className={styles.previewList}>
                          {slotSelectedClients.slice(0, 4).map((client) => (
                            <MiniClientCard
                              key={client.id}
                              title={`${client.firstName} ${client.lastName || ''}`.trim()}
                              subtitle={
                                slotSuggestedRecipients.find((item) => item.clientId === client.id)
                                  ?.reason
                              }
                            />
                          ))}
                        </div>
                        <div className={styles.actionRow}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPickerMode('slot')}
                          >
                            <Users size={16} />
                            {intl.formatMessage({ id: 'rebooking.editRecipients' })}
                          </Button>
                        </div>
                      </Card>
                    </Card>
                  </section>

                  <section className={styles.section}>
                    <Card className={styles.stepCard}>
                      <div className={styles.sectionHeader}>
                        <div>
                          <h2>{intl.formatMessage({ id: 'rebooking.step.message' })}</h2>
                          <p className={styles.helperText}>
                            {intl.formatMessage({ id: 'rebooking.messageHint' })}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {intl.formatMessage(
                            { id: 'rebooking.readyToSend.slot' },
                            { count: slotSelectedClientIds.length },
                          )}
                        </Badge>
                      </div>

                      <TonePicker tone={slotTone} onChange={setSlotTone} />

                      <div className={styles.actionRow}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleImproveSlotMessage}
                          disabled={slotPreviewIds.length === 0}
                          loading={generateSlotMessage.isPending}
                        >
                          <Wand2 size={16} />
                          {intl.formatMessage({ id: 'rebooking.improveText' })}
                        </Button>
                      </div>

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

                      <div className={styles.sendBar}>
                        <div className={styles.sendMeta}>
                          {intl.formatMessage(
                            { id: 'rebooking.readyToSend.slot' },
                            { count: slotSelectedClientIds.length },
                          )}
                        </div>
                        <Button
                          fullWidth
                          onClick={handleSendSlotCampaign}
                          disabled={slotDisabled}
                          loading={sendSlotCampaign.isPending}
                          icon={<Send size={18} />}
                        >
                          {intl.formatMessage({ id: 'rebooking.sendSlotPromo' })}
                        </Button>
                      </div>
                    </Card>
                  </section>
                </>
              )}
            </>
          ) : (
            <>
              <section className={styles.section}>
                <Card className={styles.stepCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2>{intl.formatMessage({ id: 'rebooking.step.segment' })}</h2>
                      <p className={styles.helperText}>
                        {intl.formatMessage({ id: 'rebooking.remindersHint' })}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {intl.formatMessage(
                        { id: 'rebooking.selectionSummary' },
                        { count: cycleSelectedClientIds.length },
                      )}
                    </Badge>
                  </div>

                  {remindersLoading ? (
                    <SkeletonList count={3} />
                  ) : returnReminders.length === 0 ? (
                    <EmptyState
                      icon={<History size={40} />}
                      title={intl.formatMessage({ id: 'master.returnRemindersEmpty' })}
                    />
                  ) : (
                    <Card className={styles.summaryCard}>
                      <div className={styles.summaryTitle}>
                        <History size={16} />
                        {intl.formatMessage({ id: 'master.returnReminders' })}
                      </div>
                      <div className={styles.summaryText}>
                        {intl.formatMessage({ id: 'rebooking.remindersHint' })}
                      </div>
                      <div className={styles.previewList}>
                        {cycleSelectedRecipients.slice(0, 4).map((item) => (
                          <MiniClientCard
                            key={item.clientId}
                            title={`${item.firstName} ${item.lastName || ''}`.trim()}
                            subtitle={item.reason}
                          />
                        ))}
                      </div>
                      <div className={styles.actionRow}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPickerMode('cycle')}
                        >
                          <Users size={16} />
                          {intl.formatMessage({ id: 'rebooking.editRecipients' })}
                        </Button>
                      </div>
                    </Card>
                  )}
                </Card>
              </section>

              <section className={styles.section}>
                <Card className={styles.stepCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2>{intl.formatMessage({ id: 'rebooking.step.options' })}</h2>
                      <p className={styles.helperText}>
                        {intl.formatMessage({ id: 'rebooking.chooseQuickBookingSlots' })}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {intl.formatMessage(
                        { id: 'rebooking.selectedSlots' },
                        { count: cycleSelectedSlotKeys.length },
                      )}
                    </Badge>
                  </div>

                  {cycleSlotPool.length === 0 ? (
                    <EmptyState
                      icon={<CalendarClock size={40} />}
                      title={intl.formatMessage({ id: 'rebooking.noEmptySlotsForDate' })}
                    />
                  ) : (
                    <div className={styles.previewDates}>
                      {groupSlotsByDate(cycleSlotPool).map(([date, slots]) => (
                        <Card key={date} className={styles.previewDateCard}>
                          <div className={styles.previewDate}>{formatDateLabel(date)}</div>
                          <div className={styles.previewTimeRow}>
                            {slots.map((slot) => {
                              const key = `${slot.date}-${slot.startTime}`;
                              const selected = cycleSelectedSlotKeys.includes(key);
                              return (
                                <button
                                  key={key}
                                  className={`${styles.previewTimeChip} ${selected ? styles.previewTimeChipSelected : ''}`}
                                  onClick={() => toggleCycleSlot(key, setCycleSelectedSlotKeys)}
                                >
                                  {slot.startTime}
                                </button>
                              );
                            })}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
              </section>

              <section className={styles.section}>
                <Card className={styles.stepCard}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2>{intl.formatMessage({ id: 'rebooking.step.message' })}</h2>
                      <p className={styles.helperText}>
                        {intl.formatMessage({ id: 'rebooking.messageHint' })}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {intl.formatMessage(
                        { id: 'rebooking.readyToSend.cycle' },
                        { count: cycleSelectedClientIds.length },
                      )}
                    </Badge>
                  </div>

                  <TonePicker tone={cycleTone} onChange={setCycleTone} />

                  <div className={styles.actionRow}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleImproveCycleMessage}
                      disabled={cyclePreviewIds.length === 0 || cycleSlotOptions.length === 0}
                      loading={generateCycleMessage.isPending}
                    >
                      <Wand2 size={16} />
                      {intl.formatMessage({ id: 'rebooking.improveText' })}
                    </Button>
                  </div>

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

                  <div className={styles.sendBar}>
                    <div className={styles.sendMeta}>
                      {intl.formatMessage(
                        { id: 'rebooking.readyToSend.cycle' },
                        { count: cycleSelectedClientIds.length },
                      )}
                    </div>
                    <Button
                      fullWidth
                      onClick={handleSendCycleCampaign}
                      disabled={cycleDisabled}
                      loading={sendCycleCampaign.isPending}
                      icon={<Send size={18} />}
                    >
                      {intl.formatMessage({ id: 'rebooking.sendCyclePromo' })}
                    </Button>
                  </div>
                </Card>
              </section>
            </>
          )}

          <section className={styles.section}>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => setDetailsOpen((prev) => !prev)}
              icon={<History size={18} />}
            >
              {detailsOpen
                ? intl.formatMessage({ id: 'rebooking.hideDetails' })
                : intl.formatMessage({ id: 'rebooking.showDetails' })}
            </Button>

            {detailsOpen && (
              <div className={styles.detailsStack}>
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

                <div className={styles.sectionHeader}>
                  <h2>{intl.formatMessage({ id: 'rebooking.sendLog' })}</h2>
                </div>
                <div className={styles.logList}>
                  {data.sendLog.map((logItem) => (
                    <Card key={logItem.id} className={styles.logCard}>
                      <div className={styles.logTop}>
                        <div>
                          <div className={styles.logTitleRow}>
                            <div className={styles.slotTime}>
                              {`${formatDateLabel(logItem.date)} · ${logItem.startTime} — ${logItem.endTime}`}
                            </div>
                            <Badge variant="secondary">
                              {intl.formatMessage({ id: `rebooking.logType.${logItem.type}` })}
                            </Badge>
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
              </div>
            )}
          </section>
        </>
      )}

      <BottomSheet
        open={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={intl.formatMessage({
          id:
            pickerMode === 'cycle'
              ? 'rebooking.recipientPickerTitle.cycle'
              : 'rebooking.recipientPickerTitle.slot',
        })}
      >
        <div className={styles.pickerContent}>
          <input
            className={styles.searchInput}
            value={pickerSearch}
            onChange={(event) => setPickerSearch(event.target.value)}
            placeholder={intl.formatMessage({ id: 'rebooking.recipientSearch' })}
          />

          <div className={styles.pickerList}>
            {pickerMode === 'slot' && clientsLoading && <SkeletonList count={4} />}

            {pickerMode === 'slot' &&
              !clientsLoading &&
              slotPickerItems.map((item) => (
                <PickerRow
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  checked={item.checked}
                  disabled={item.disabled}
                  onToggle={item.onToggle}
                />
              ))}

            {pickerMode === 'cycle' &&
              cyclePickerItems.map((item) => (
                <PickerRow
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  checked={item.checked}
                  badge={item.badge}
                  muted={item.muted}
                  disabled={item.disabled}
                  onToggle={item.onToggle}
                />
              ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
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

function MiniClientCard({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: 'high' | 'medium' | 'low';
}) {
  return (
    <Card className={styles.previewCard}>
      <div className={styles.previewCardTop}>
        <div className={styles.clientName}>{title}</div>
        {badge && (
          <Badge
            variant={badge === 'high' ? 'success' : badge === 'medium' ? 'warning' : 'secondary'}
          >
            {badge.toUpperCase()}
          </Badge>
        )}
      </div>
      {subtitle && <div className={styles.metaLine}>{subtitle}</div>}
    </Card>
  );
}

function PickerRow({
  title,
  subtitle,
  checked,
  badge,
  muted,
  disabled,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  badge?: 'high' | 'medium' | 'low';
  muted?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      className={`${styles.pickerRow} ${muted ? styles.pickerRowMuted : ''} ${disabled ? styles.pickerRowDisabled : ''}`}
      onClick={disabled ? undefined : onToggle}
    >
      <div className={styles.clientCardTop}>
        <label className={styles.checkboxWrap}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onToggle}
            onClick={(event) => event.stopPropagation()}
          />
          <span className={styles.clientName}>{title}</span>
        </label>
        {badge && (
          <Badge
            variant={badge === 'high' ? 'success' : badge === 'medium' ? 'warning' : 'secondary'}
          >
            {badge.toUpperCase()}
          </Badge>
        )}
      </div>
      {subtitle && <div className={styles.metaLine}>{subtitle}</div>}
    </Card>
  );
}

function buildReturnReminderReason(
  reminder:
    | {
        daysUntilReturn: number;
        lastVisitAt: string | null;
      }
    | undefined,
  intl: ReturnType<typeof useIntl>,
) {
  if (!reminder) {
    return intl.formatMessage({ id: 'rebooking.manualRecipient' });
  }

  const timingLabel =
    reminder.daysUntilReturn <= 0
      ? intl.formatMessage({ id: 'master.returnOverdue' })
      : intl.formatMessage({ id: 'master.returnDaysLeft' }, { days: reminder.daysUntilReturn });

  if (!reminder.lastVisitAt) {
    return timingLabel;
  }

  return `${intl.formatMessage(
    { id: 'clients.lastVisit' },
    {
      date: new Date(reminder.lastVisitAt).toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'short',
      }),
    },
  )} · ${timingLabel}`;
}

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

function groupSlotsByDate(slots: RebookingEmptySlot[]) {
  const grouped = new Map<string, RebookingEmptySlot[]>();

  slots.forEach((slot) => {
    const list = grouped.get(slot.date) || [];
    list.push(slot);
    grouped.set(slot.date, list);
  });

  return [...grouped.entries()];
}

function buildDefaultSlotMessage(slot: RebookingEmptySlot) {
  return `Привіт! Звільнилося вікно ${formatDateLabel(slot.date)} з ${slot.startTime} до ${slot.endTime}. Якщо тобі зручно — можеш швидко записатися через кнопку нижче 💅`;
}

function buildSlotCampaignOptions(
  selectedSlot: RebookingEmptySlot | null,
  allSlots: RebookingEmptySlot[],
) {
  if (!selectedSlot) {
    return [] as Array<{ date: string; startTime: string; endTime: string }>;
  }

  const selectedKey = `${selectedSlot.date}-${selectedSlot.startTime}`;
  const sameDayAlternatives = allSlots.filter(
    (slot) => slot.date === selectedSlot.date && `${slot.date}-${slot.startTime}` !== selectedKey,
  );
  const crossDayAlternatives = allSlots.filter(
    (slot) => slot.date !== selectedSlot.date && `${slot.date}-${slot.startTime}` !== selectedKey,
  );

  return [selectedSlot, ...sameDayAlternatives, ...crossDayAlternatives]
    .slice(0, 4)
    .map(toCampaignSlotOption);
}

function toCampaignSlotOption(slot: RebookingEmptySlot) {
  return {
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
}

function showPromoError(error: unknown, intl: ReturnType<typeof useIntl>) {
  const message =
    error instanceof ApiRequestError && error.message
      ? error.message
      : intl.formatMessage({ id: 'common.error' });

  try {
    getTelegram().showAlert(message);
  } catch {
    window.alert(message);
  }
}

function buildDefaultCycleMessage({
  defaultCycleDays,
  slotOptions,
}: {
  defaultCycleDays: number;
  slotOptions: RebookingEmptySlot[];
}) {
  const summary = slotOptions
    .map((slot) => `${formatDateLabel(slot.date)} · ${slot.startTime}`)
    .join(', ');

  return `Привіт! Від попереднього візиту вже минуло близько ${defaultCycleDays} днів, тож саме час обрати новий запис ✨${summary ? ` Найближчі варіанти: ${summary}.` : ''}`;
}

function buildSlotSuggestions(
  selectedSlot: RebookingEmptySlot | null,
  recommendations: RebookingRecommendation[],
  allClients: Client[],
) {
  const scored = recommendations
    .map((item) => {
      let score = item.priorityScore;

      if (item.segments.includes('due_soon')) score += 14;
      if (item.visitCount >= 3) score += 8;
      if (selectedSlot?.isMorning && item.segments.includes('morning')) score += 18;
      if (!selectedSlot?.isMorning && !item.segments.includes('morning')) score += 6;

      return {
        clientId: item.clientId,
        score,
        reason:
          selectedSlot?.isMorning && item.segments.includes('morning')
            ? 'Зазвичай обирає ранковий час'
            : item.reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SLOT_RECIPIENTS);

  const seen = new Set(scored.map((item) => item.clientId));
  const fallback = allClients
    .filter((client) => !seen.has(client.id))
    .slice(0, Math.max(0, MAX_SLOT_RECIPIENTS - scored.length))
    .map((client) => ({
      clientId: client.id,
      score: 0,
      reason: 'Активний клієнт у Telegram',
    }));

  return [...scored, ...fallback];
}

function toggleArrayValue(value: string, setter: Dispatch<SetStateAction<string[]>>) {
  setter((prev) =>
    prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
  );
}

function toggleCycleSlot(key: string, setter: Dispatch<SetStateAction<string[]>>) {
  setter((prev) => {
    if (prev.includes(key)) {
      return prev.filter((item) => item !== key);
    }

    if (prev.length >= MAX_CYCLE_SLOT_OPTIONS) {
      return [...prev.slice(1), key];
    }

    return [...prev, key];
  });
}
