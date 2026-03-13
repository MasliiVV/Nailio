import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Scissors, Pencil, Trash2 } from 'lucide-react';
import { useServices, useCreateService, useUpdateService, useDeleteService } from '@/hooks';
import { Card, Button, Input, BottomSheet, EmptyState, SkeletonList } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Service, CreateServiceDto } from '@/types';

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

  const resetForm = () => {
    setName('');
    setPrice('');
    setDuration('');
    setDescription('');
    setEditing(null);
    setShowForm(false);
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
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1 className="page-title">{intl.formatMessage({ id: 'services.title' })}</h1>
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
      </div>

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

      {services &&
        services.map((service: Service) => (
          <Card key={service.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div
                style={{
                  width: 6,
                  height: 40,
                  borderRadius: 3,
                  background: service.color || 'var(--color-primary)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{service.name}</div>
                <div className="text-secondary" style={{ fontSize: 13 }}>
                  {service.durationMinutes} {intl.formatMessage({ id: 'common.min' })} ·{' '}
                  {(service.price / 100).toFixed(0)} {intl.formatMessage({ id: 'common.uah' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="touchable" onClick={() => handleEdit(service)} aria-label="Edit">
                  <Pencil size={18} />
                </button>
                <button
                  className="touchable"
                  onClick={() => {
                    const tg = getTelegram();
                    if (tg) {
                      tg.showConfirm(
                        intl.formatMessage({ id: 'services.deleteConfirm' }),
                        (confirmed) => {
                          if (confirmed) deleteService.mutate(service.id);
                        },
                      );
                    } else {
                      deleteService.mutate(service.id);
                    }
                  }}
                  aria-label="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </Card>
        ))}

      <BottomSheet
        open={showForm}
        onClose={resetForm}
        title={
          editing
            ? intl.formatMessage({ id: 'common.edit' })
            : intl.formatMessage({ id: 'services.addService' })
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        </div>
      </BottomSheet>
    </div>
  );
}
