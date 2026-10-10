import { ColorInput, ColorSwatch, Group, Input } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

const SWATCHES = [
  '#f25a5a', '#f59f45', '#f2c94c', '#a3c94f', '#6fcf97', '#2f9e8f',
  '#4fb3d9', '#2f7ee6', '#5b6ee8', '#9b6bd8', '#e86fa8', '#8d99ae',
];

/** 一排可以直接点的色块 + 自定义颜色输入框。分类和账户共用。 */
export default function ColorField({ value, onChange, label = '颜色' }) {
  return (
    <Input.Wrapper label={label}>
      <Group gap={8} mt={6} mb={8}>
        {SWATCHES.map((c) => (
          <ColorSwatch
            key={c}
            component="button"
            type="button"
            color={c}
            size={28}
            onClick={() => onChange(c)}
            aria-label={`颜色 ${c}`}
            style={{ color: '#fff', cursor: 'pointer' }}
          >
            {value?.toLowerCase() === c && <IconCheck size={16} />}
          </ColorSwatch>
        ))}
      </Group>
      <ColorInput value={value} onChange={onChange} placeholder="也可以输入自定义颜色，例如 #ff8800" aria-label="自定义颜色" />
    </Input.Wrapper>
  );
}
