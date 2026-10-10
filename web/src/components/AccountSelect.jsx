import { Select } from '@mantine/core';

export default function AccountSelect({ accounts, value, onChange, placeholder = '不选择', ...rest }) {
  const data = accounts.map((a) => ({
    value: String(a.id),
    label: `${a.name}${a.type === 'credit_card' ? '（信用卡）' : ''}${a.currency && a.currency !== 'CAD' ? ` · ${a.currency}` : ''}`,
  }));
  return (
    <Select
      data={data}
      value={value ? String(value) : null}
      onChange={(v) => onChange(v || '')}
      placeholder={placeholder}
      clearable
      comboboxProps={{ withinPortal: true }}
      {...rest}
    />
  );
}
