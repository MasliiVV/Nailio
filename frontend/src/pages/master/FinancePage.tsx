import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Plus,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useTransactions, useFinanceSummary, useCreateTransaction } from '@/hooks';
import {
  Card,
  Button,
  Input,
  BottomSheet,
  EmptyState,
  Tabs,
  SkeletonList,
  PageHeader,
  FormGroup,
} from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Transaction, TransactionType, CreateTransactionDto } from '@/types';
import styles from './FinancePage.module.css';

export function FinancePage() {
  const intl = useIntl();
  const { data: transactions, isLoading: loadingTx } = useTransactions();
  const { data: summary, isLoading: loadingSummary } = useFinanceSummary();
  const createTx = useCreateTransaction();

  const [showForm, setShowForm] = useState(false);
  const [txType, setTxType] = useState<TransactionType>('income');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(intl.locale === 'en' ? 'en-US' : 'uk-UA', {
        maximumFractionDigits: 0,
      }),
    [intl.locale],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intl.locale === 'en' ? 'en-GB' : 'uk-UA', {
        day: 'numeric',
        month: 'short',
      }),
    [intl.locale],
  );

  const formatMoney = (value: number) => `${currencyFormatter.format(value / 100)} ₴`;

  const handleAdd = () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0 || isNaN(numAmount)) {
      getTelegram()?.showAlert?.(intl.formatMessage({ id: 'common.error' }));
      return;
    }
    const dto: CreateTransactionDto = {
      type: txType,
      amount: numAmount * 100,
      description,
    };
    createTx.mutate(dto, {
      onSuccess: () => {
        getTelegram()?.HapticFeedback.notificationOccurred('success');
        setShowForm(false);
        setAmount('');
        setDescription('');
      },
    });
  };

  const isLoading = loadingTx || loadingSummary;
  const items = transactions?.items || [];
  const totalEntries = items.length;
  const net = summary?.net ?? 0;
  const averageTransaction =
    totalEntries > 0
      ? Math.round(items.reduce((acc, tx) => acc + Math.abs(tx.amount), 0) / totalEntries)
      : 0;
  const latestTransaction = items[0] ?? null;
  const cashflowTone = net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral';
  const cashflowLabel =
    cashflowTone === 'positive'
      ? intl.formatMessage({ id: 'finance.cashflowPositive' })
      : cashflowTone === 'negative'
        ? intl.formatMessage({ id: 'finance.cashflowNegative' })
        : intl.formatMessage({ id: 'finance.cashflowNeutral' });
  const balanceToneClass =
    cashflowTone === 'positive'
      ? styles.balancePositive
      : cashflowTone === 'negative'
        ? styles.balanceNegative
        : styles.balanceNeutral;

  const summaryCards = [
    {
      key: 'income',
      label: intl.formatMessage({ id: 'finance.income' }),
      value: `+${formatMoney(summary?.income ?? 0)}`,
      helper: intl.formatMessage({ id: 'finance.incomeHint' }),
      icon: <ArrowUpRight size={18} />,
      toneClass: styles.toneIncome,
    },
    {
      key: 'expense',
      label: intl.formatMessage({ id: 'finance.expenses' }),
      value: `-${formatMoney(summary?.expense ?? 0)}`,
      helper: intl.formatMessage({ id: 'finance.expenseHint' }),
      icon: <ArrowDownLeft size={18} />,
      toneClass: styles.toneExpense,
    },
    {
      key: 'net',
      label: intl.formatMessage({ id: 'finance.net' }),
      value: formatMoney(net),
      helper: cashflowLabel,
      icon: <Landmark size={18} />,
      toneClass: styles.toneNet,
    },
    {
      key: 'count',
      label: intl.formatMessage({ id: 'finance.transactionCount' }),
      value: totalEntries,
      helper: intl.formatMessage(
        { id: 'finance.averageTransaction' },
        { value: averageTransaction },
      ),
      icon: <Receipt size={18} />,
      toneClass: styles.toneCount,
    },
  ] as const;

  if (isLoading) {
    return (
      <div className="page">
        <SkeletonList count={5} />
      </div>
    );
  }

  return (
    <div className="page animate-fade-in">
      <PageHeader
        title={intl.formatMessage({ id: 'finance.title' })}
        subtitle={intl.formatMessage({ id: 'finance.subtitle' })}
      />

      <Card className={styles.heroCard}>
        <div className={styles.heroTopRow}>
          <div>
            <div className={styles.heroEyebrow}>
              <Sparkles size={14} />
              {intl.formatMessage({ id: 'finance.cashflowOverview' })}
            </div>
            <h2 className={styles.heroTitle}>{intl.formatMessage({ id: 'finance.heroTitle' })}</h2>
            <p className={styles.heroSubtitle}>
              {intl.formatMessage({ id: 'finance.heroSubtitle' })}
            </p>
          </div>

          <Button className={styles.heroAction} onClick={() => setShowForm(true)}>
            <>
              <Plus size={18} />
              {intl.formatMessage({ id: 'finance.addTransaction' })}
            </>
          </Button>
        </div>

        <div className={styles.heroMetrics}>
          <div className={`${styles.balanceCard} ${balanceToneClass}`}>
            <span className={styles.balanceLabel}>
              {intl.formatMessage({ id: 'finance.currentBalance' })}
            </span>
            <strong className={styles.balanceValue}>{formatMoney(net)}</strong>
            <span className={styles.balanceHint}>{cashflowLabel}</span>
          </div>

          <div className={styles.snapshotCard}>
            <span className={styles.snapshotLabel}>
              {intl.formatMessage({ id: 'finance.latestEntry' })}
            </span>
            <strong className={styles.snapshotValue}>
              {latestTransaction?.description ||
                intl.formatMessage({ id: 'finance.noRecentActivity' })}
            </strong>
            <span className={styles.snapshotHint}>
              {latestTransaction
                ? `${dateFormatter.format(new Date(latestTransaction.createdAt))} · ${
                    latestTransaction.type === 'income'
                      ? `+${formatMoney(latestTransaction.amount)}`
                      : `-${formatMoney(latestTransaction.amount)}`
                  }`
                : intl.formatMessage({ id: 'finance.emptyHint' })}
            </span>
          </div>
        </div>
      </Card>

      <div className={styles.summaryGrid}>
        {summaryCards.map((item) => (
          <Card key={item.key} className={`${styles.summaryCard} ${item.toneClass}`}>
            <div className={styles.summaryIcon}>{item.icon}</div>
            <span className={styles.summaryLabel}>{item.label}</span>
            <span className={styles.summaryValue}>{item.value}</span>
            <span className={styles.summaryHelper}>{item.helper}</span>
          </Card>
        ))}
      </div>

      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>
            {intl.formatMessage({ id: 'finance.transactions' })}
          </h2>
          <p className={styles.sectionSubtitle}>
            {intl.formatMessage({ id: 'finance.transactionsSubtitle' }, { count: totalEntries })}
          </p>
        </div>
      </div>

      {transactions && transactions.items.length === 0 && (
        <Card className={styles.emptyWrap}>
          <EmptyState
            icon={<Wallet size={40} />}
            title={intl.formatMessage({ id: 'finance.noTransactions' })}
            description={intl.formatMessage({ id: 'finance.emptyHint' })}
          />
        </Card>
      )}

      {transactions &&
        transactions.items.map((tx: Transaction) => (
          <Card key={tx.id} className={styles.txCard}>
            <div className={styles.txRow}>
              <div className={styles.txIcon}>
                {tx.type === 'income' ? (
                  <TrendingUp size={20} color="var(--color-success)" />
                ) : (
                  <TrendingDown size={20} color="var(--color-destructive)" />
                )}
              </div>
              <div className={styles.txInfo}>
                <span className={styles.txDesc}>{tx.description}</span>
                <div className={styles.txMeta}>
                  <span className={styles.txDate}>
                    {dateFormatter.format(new Date(tx.createdAt))}
                  </span>
                  <span className={styles.txTypePill} data-type={tx.type}>
                    {intl.formatMessage({
                      id: tx.type === 'income' ? 'finance.income' : 'finance.expenses',
                    })}
                  </span>
                </div>
              </div>
              <span className={styles.txAmount} data-type={tx.type}>
                {tx.type === 'income' ? '+' : '-'}
                {formatMoney(tx.amount)}
              </span>
            </div>
          </Card>
        ))}

      <BottomSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title={intl.formatMessage({ id: 'finance.addTransaction' })}
      >
        <FormGroup>
          <Tabs
            tabs={[
              { id: 'income', label: intl.formatMessage({ id: 'finance.income' }) },
              { id: 'expense', label: intl.formatMessage({ id: 'finance.expenses' }) },
            ]}
            activeId={txType}
            onChange={(id) => setTxType(id as TransactionType)}
          />
          <Input
            label={intl.formatMessage({ id: 'finance.amount' })}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label={intl.formatMessage({ id: 'finance.description' })}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            fullWidth
            loading={createTx.isPending}
            onClick={handleAdd}
            disabled={!amount || !description}
          >
            {intl.formatMessage({ id: 'common.save' })}
          </Button>
        </FormGroup>
      </BottomSheet>
    </div>
  );
}
