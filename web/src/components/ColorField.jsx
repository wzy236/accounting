import { ColorInput, ColorSwatch, Group, Input } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { SWATCHES } from '../lib/colors.js';

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
