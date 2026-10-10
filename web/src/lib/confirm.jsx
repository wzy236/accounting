import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';

/** 替代 window.confirm 的确认弹窗，返回 Promise<boolean>。 */
export function confirmAction({ title = '确认操作', message, confirmLabel = '确认', danger = true }) {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title,
      centered: true,
      children: <Text size="sm">{message}</Text>,
      labels: { confirm: confirmLabel, cancel: '取消' },
      confirmProps: danger ? { color: 'red' } : undefined,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}
