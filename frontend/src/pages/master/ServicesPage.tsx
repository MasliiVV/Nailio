import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Scissors, Pencil, Trash2 } from 'lucide-react';
import { useServices, useCreateService, useUpdateService, useDeleteService } from '@/hooks';
import {
  Card,
  Button,
  Input,
  BottomSheet,
  EmptyState,
  SkeletonList,
  PageHeader,
  FormGroup,
} from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Service, CreateServiceDto } from '@/types';
import styles from './ServicesPage.module.css';

export function ServicesPage() {
  const intl = useIntl();
  const { data: services, isLoading } = useServices();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');

  const activeServices = (services || []).filter((service) => service.isActive);
  const inactiveServices = (services || []).filter((service) => !service.isActive);

  const resetForm = () => {
    setName('');
    setPrice('');
    setDuration('');
    setDescription('');
    setEditing(null);
    setShowForm(false);
  };

  const handleDelete = async (service: Service) => {
    try {
      await deleteService.mutateAsync(service.id);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch (err) {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
      getTelegram()?.showAlert?.(
        intl.formatMessage({ id: 'common.error' }) +
          ': ' +
          (err instanceof Error ? err.message : 'Unknown error'),
      );
    }
  };

  const confirmDelete = (service: Service) => {
    const tg = getTelegram();
    const message = intl.formatMessage({
      id: service.isActive ? 'services.deleteConfirm' : 'services.deleteInactiveConfirm',
    });

    if (tg) {
      tg.showConfirm(message, (confirmed) => {
        if (confirmed) {
          void handleDelete(service);
        }
      });
      return;
    }

    void handleDelete(service);
  };

  const handleEdit = (service: Service) => {
    setEditing(service);
    setName(service.name);
    setPrice(String(service.price / 100));
    setDuration(String(service.durationMinutes));
    setDescription(service.description || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    const dto: CreateServiceDto = {
      name,
      price: Number(price) * 100,
      durationMinutes: Number(duration),
      description: description || undefined,
    };

    try {
      if (editing) {
        await updateService.mutateAsync({ id: editing.id, dto });
      } else {
        await createService.mutateAsync(dto);
      }
      resetForm();
    } catch (err) {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
      getTelegram()?.showAlert?.(
        intl.formatMessage({ id: 'common.error' }) +
          ': ' +
          (err instanceof Error ? err.message : 'Unknown error'),
      );
    }
  };

  return (
    <div className="page animate-fade-in">
      <PageHeader
        title={intl.formatMessage({ id: 'services.title' })}
        action={
          <Button
            size="sm"
            onClick={() => {
              getTelegram()?.HapticFeedback.impactOccurred('light');
              resetForm();
              setShowForm(true);
            }}
          >
            + {intl.formatMessage({ id: 'common.add' })}
          </Button>
        }
      />

      {isLoading && <SkeletonList count={3} />}

      {!isLoading && services && services.length === 0 && (
        <EmptyState
          icon={<Scissors size={40} />}
          title={intl.formatMessage({ id: 'services.noServices' })}
          action={
            <Button onClick={() => setShowForm(true)}>
              {intl.formatMessage({ id: 'services.addService' })}
            </Button>
          }
        />
      )}

      <div className={styles.list}>
        {activeServices.map((service: Service) => (
          <Card key={service.id} className={styles.serviceCard}>
            <div
              className={styles.colorBar}
              style={{ background: service.color || 'var(--color-primary)' }}
            />
            <div className={styles.serviceInfo}>
              <div className={styles.serviceHeader}>
                <div className={styles.serviceName}>{service.name}</div>
                <span className={styles.statusBadge}>
                  {intl.formatMessage({ id: 'services.active' })}
                </span>
              </div>
              <div className={styles.serviceMeta}>
                {service.durationMinutes} {intl.formatMessage({ id: 'common.min' })} ·{' '}
                {(service.price / 100).toFixed(0)} {intl.formatMessage({ id: 'common.uah' })}
              </div>
            </div>
            <div className={styles.serviceActions}>
              <button
                className="touchable"
                onClick={() => handleEdit(service)}
                aria-label={intl.formatMessage({ id: 'common.edit' })}
              >
                <Pencil size={18} />
              </button>
              <button
                className="touchable"
                onClick={() => {
                  confirmDelete(service);
                }}
                aria-label={intl.formatMessage({ id: 'common.delete' })}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </Card>
        ))}

        {inactiveServices.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {intl.formatMessage({ id: 'services.inactive' })} · {inactiveServices.length}
            </div>
            {inactiveServices.map((service: Service) => (
              <Card key={service.id} className={`${styles.serviceCard} ${styles.inactiveCard}`}>
                <div
                  className={styles.colorBar}
                  style={{ background: service.color || 'var(--color-primary)' }}
                />
                <div className={styles.serviceInfo}>
                  <div className={styles.serviceHeader}>
                    <div className={styles.serviceName}>{service.name}</div>
                    <span className={`${styles.statusBadge} ${styles.inactiveBadge}`}>
                      {intl.formatMessage({ id: 'services.inactive' })}
                    </span>
                  </div>
                  <div className={styles.serviceMeta}>
                    {service.durationMinutes} {intl.formatMessage({ id: 'common.min' })} ·{' '}
                    {(service.price / 100).toFixed(0)} {intl.formatMessage({ id: 'common.uah' })}
                  </div>
                </div>
                <div className={styles.serviceActions}>
                  <button
                    className={`touchable ${styles.inactiveAction}`}
                    onClick={() => handleEdit(service)}
                    aria-label={intl.formatMessage({ id: 'common.edit' })}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className={`touchable ${styles.inactiveAction}`}
                    onClick={() => {
                      confirmDelete(service);
                    }}
                    aria-label={intl.formatMessage({ id: 'common.delete' })}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomSheet
        open={showForm}
        onClose={resetForm}
        title={
          editing
            ? intl.formatMessage({ id: 'common.edit' })
            : intl.formatMessage({ id: 'services.addService' })
        }
      >
        <FormGroup>
          <Input
            label={intl.formatMessage({ id: 'services.name' })}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={intl.formatMessage({ id: 'services.price' })}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            type="number"
          />
          <Input
            label={intl.formatMessage({ id: 'services.duration' })}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            type="number"
          />
          <Input
            label={intl.formatMessage({ id: 'services.description' })}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            fullWidth
            loading={createService.isPending || updateService.isPending}
            onClick={handleSave}
            disabled={!name || !price || !duration}
          >
            {intl.formatMessage({ id: 'common.save' })}
          </Button>
        </FormGroup>
      </BottomSheet>
    </div>
  );
}
