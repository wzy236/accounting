import { notifications } from '@mantine/notifications';

function showToast(message, isError = false) {
  notifications.show({
    message,
    color: isError ? 'red' : 'teal',
    autoClose: isError ? 5000 : 2500,
    withBorder: true,
  });
}

export function useToast() {
  return showToast;
}
