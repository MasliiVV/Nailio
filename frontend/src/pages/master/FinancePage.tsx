import { useState } from 'react';
import { useIntl } from 'react-intl';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
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
        action={
          <Button size="sm" onClick={() => setShowForm(true)}>
            + {intl.formatMessage({ id: 'common.add' })}
          </Button>
        }
      />

      {summary && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard} data-type="income">
            <span className={styles.summaryLabel}>
              {intl.formatMessage({ id: 'finance.income' })}
            </span>
            <span className={styles.summaryValue}>+{(summary.income / 100).toFixed(0)} ₴</span>
          </div>
          <div className={styles.summaryCard} data-type="expense">
            <span className={styles.summaryLabel}>
              {intl.formatMessage({ id: 'finance.expenses' })}
            </span>
            <span className={styles.summaryValue}>-{(summary.expense / 100).toFixed(0)} ₴</span>
          </div>
          <div className={styles.summaryCard} data-type="net">
            <span className={styles.summaryLabel}>{intl.formatMessage({ id: 'finance.net' })}</span>
            <span className={styles.summaryValue}>{(summary.net / 100).toFixed(0)} ₴</span>
          </div>
        </div>
      )}

      <h2 className={styles.sectionTitle}>{intl.formatMessage({ id: 'finance.transactions' })}</h2>

      {transactions && transactions.items.length === 0 && (
        <EmptyState
          icon={<Wallet size={40} />}
          title={intl.formatMessage({ id: 'finance.noTransactions' })}
        />
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
                <span className={styles.txDate}>
                  {new Date(tx.createdAt).toLocaleDateString('uk-UA')}
                </span>
              </div>
              <span className={styles.txAmount} data-type={tx.type}>
                {tx.type === 'income' ? '+' : '-'}
                {(tx.amount / 100).toFixed(0)} ₴
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
