import { useCallback, useState } from 'react';
import {
  Button, Drawer, Group, Input, NumberInput, SegmentedControl, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconTrash } from '@tabler/icons-react';
import { useSupabase } from '../lib/SupabaseContext.jsx';
import { useData } from '../lib/DataContext.jsx';
import { useToast } from '../lib/toast.js';
import { confirmAction } from '../lib/confirm.jsx';
import { createTransaction, updateTransaction, deleteTransaction, createTransfer } from '../lib/api.js';
import { CURRENCIES, HOME_CURRENCY, fetchRate, round2 } from '../lib/currency.js';
import { fmt, todayStr } from '../lib/format.js';
import CategoryPicker from './CategoryPicker.jsx';
import AccountSelect from './AccountSelect.jsx';

const MODE_COLOR = { income: 'blue', expense: 'coral', transfer: 'gray' };

function TransactionForm({ tx, defaultDate, defaultMode, defaultAccountId, onDone }) {
  const { client } = useSupabase();
  const { categories, accounts } = useData();
  const showToast = useToast();

  const isEdit = !!tx;
  const isTransferEdit = isEdit && tx.source === 'transfer';
  // 外币记录按原币金额编辑（外币账户的余额是按原币算的），保存时用记账当时的汇率换回 CAD
  const editForeign = isEdit && tx.currency && tx.currency !== HOME_CURRENCY && tx.original_amount != null;
  const editRate = editForeign ? Number(tx.exchange_rate) || null : null;

  const [mode, setMode] = useState(isEdit ? (isTransferEdit ? 'transfer' : tx.type) : defaultMode);
  const [amount, setAmount] = useState(isEdit ? Number(editForeign ? tx.original_amount : tx.amount) : '');
  const [date, setDate] = useState(tx?.date || defaultDate || todayStr());
  const [categoryId, setCategoryId] = useState(tx?.category_id || '');
  const [accountId, setAccountId] = useState(tx ? tx.account_id || '' : defaultAccountId || '');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [description, setDescription] = useState(tx?.description || '');
  const [saving, setSaving] = useState(false);

  const accountCcy = (id) => accounts.find((a) => String(a.id) === String(id))?.currency || HOME_CURRENCY;

  // 新记一笔时币种默认跟着账户走（比如筛选了美元账户再点 +，直接就是 USD）
  const initialCurrency = isEdit ? HOME_CURRENCY : accountCcy(defaultAccountId);
  const [currency, setCurrency] = useState(initialCurrency);
  const [rate, setRate] = useState(initialCurrency === HOME_CURRENCY ? 1 : null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');

  const [toAmount, setToAmount] = useState('');
  const [xferRate, setXferRate] = useState(1);

  const loadRate = useCallback(async (cur) => {
    if (cur === HOME_CURRENCY) {
      setRate(1);
      setRateError('');
      return;
    }
    setRateLoading(true);
    setRateError('');
    try {
      setRate(await fetchRate(cur, HOME_CURRENCY));
    } catch (e) {
      setRate(null);
      setRateError(e.message);
    } finally {
      setRateLoading(false);
    }
  }, []);

  const isNewTransfer = !isEdit && mode === 'transfer';
  const showCurrency = !isEdit && mode !== 'transfer';
  const foreign = showCurrency && currency !== HOME_CURRENCY;
  const converted = foreign && rate && amount ? Number(amount) * rate : null;

  function handleAccountChange(v) {
    setAccountId(v);
    if (isEdit || !v) return;
    const cur = accountCcy(v);
    if (cur !== currency) {
      setCurrency(cur);
      loadRate(cur);
    }
  }

  // 转账：两边币种不同时，转入金额默认按实时汇率换算（用户可以改成银行实际到账金额）
  const fromAcc = accounts.find((a) => String(a.id) === fromId);
  const toAcc = accounts.find((a) => String(a.id) === toId);
  const fromCcy = fromAcc?.currency || HOME_CURRENCY;
  const toCcy = toAcc?.currency || HOME_CURRENCY;
  const crossCurrency = isNewTransfer && !!fromAcc && !!toAcc && fromCcy !== toCcy;
  const suggestedTo = crossCurrency && amount && xferRate ? round2(Number(amount) * xferRate) : null;

  async function loadXferRate(fromC, toC) {
    if (fromC === toC) {
      setXferRate(1);
      return;
    }
    setXferRate(null);
    try {
      const [rFrom, rTo] = await Promise.all([fetchRate(fromC, HOME_CURRENCY), fetchRate(toC, HOME_CURRENCY)]);
      setXferRate(rFrom / rTo);
    } catch {
      setXferRate(null);
    }
  }

  function handleFromChange(v) {
    setFromId(v);
    loadXferRate(accountCcy(v), toCcy);
  }

  function handleToChange(v) {
    setToId(v);
    loadXferRate(fromCcy, accountCcy(v));
  }

  async function createNormal(amt) {
    let cadAmount = amt;
    let usedRate = null;
    if (foreign) {
      let r = rate;
      if (!r) {
        // 汇率还没取到（比如上次查询失败），提交前再试一次，还是失败就不让提交
        r = await fetchRate(currency, HOME_CURRENCY);
        setRate(r);
      }
      usedRate = r;
      cadAmount = Math.round(amt * r * 100) / 100;
    }
    await createTransaction(client, {
      date,
      type: mode,
      amount: cadAmount,
      category_id: categoryId || null,
      account_id: accountId || null,
      description: description.trim(),
      currency,
      original_amount: foreign ? amt : null,
      exchange_rate: usedRate,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showToast('请输入大于 0 的金额', true);
      return;
    }
    if (isNewTransfer) {
      if (!fromId || !toId) {
        showToast('请选择转出和转入账户', true);
        return;
      }
      if (fromId === toId) {
        showToast('转出和转入不能是同一个账户', true);
        return;
      }
      if (crossCurrency && !(Number(toAmount) > 0) && !suggestedTo) {
        showToast('请填写转入金额', true);
        return;
      }
    }

    setSaving(true);
    try {
      if (isEdit) {
        let amountFields = { amount: amt };
        if (editForeign) {
          const r = editRate || await fetchRate(tx.currency, HOME_CURRENCY);
          amountFields = { amount: round2(amt * r), original_amount: amt };
        }
        await updateTransaction(client, tx.id, {
          date,
          type: isTransferEdit ? tx.type : mode,
          ...amountFields,
          category_id: isTransferEdit ? null : categoryId || null,
          account_id: accountId || null,
          description: description.trim(),
        });
        showToast('已保存');
      } else if (isNewTransfer) {
        await createTransfer(client, {
          date,
          from: fromAcc,
          to: toAcc,
          fromAmount: amt,
          toAmount: crossCurrency ? Number(toAmount) || suggestedTo : amt,
          description: description.trim(),
        });
        showToast('转账成功');
      } else {
        await createNormal(amt);
        showToast('已添加');
      }
      onDone(true);
    } catch (err) {
      showToast((isEdit ? '保存失败：' : '添加失败：') + err.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirmAction({
      title: '删除记录',
      message: isTransferEdit
        ? '这是一笔转账的其中一侧记录，删除只会删掉这一条，另一侧账户的记录不会自动删除，确认删除？'
        : '确认删除这条记录？',
      confirmLabel: '删除',
    });
    if (!ok) return;
    try {
      await deleteTransaction(client, tx.id);
      showToast('已删除');
      onDone(true);
    } catch (err) {
      showToast('删除失败：' + err.message, true);
    }
  }

  let amountLabel = '金额';
  if (editForeign) amountLabel = `金额（${tx.currency}）`;
  else if (crossCurrency) amountLabel = `转出金额（${fromCcy}）`;
  else if (isNewTransfer && fromAcc && fromCcy !== HOME_CURRENCY) amountLabel = `金额（${fromCcy}）`;

  const segmentData = [
    { label: '收入', value: 'income', disabled: isTransferEdit },
    { label: '支出', value: 'expense', disabled: isTransferEdit },
    { label: '转账', value: 'transfer', disabled: isEdit },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          data={segmentData}
          value={mode}
          color={MODE_COLOR[mode]}
          onChange={(v) => { setMode(v); setCategoryId(''); }}
        />

        <Group gap="xs" align="flex-end" wrap="nowrap">
          <NumberInput
            label={amountLabel}
            placeholder="0.00"
            value={amount}
            onChange={setAmount}
            decimalScale={2}
            min={0}
            allowNegative={false}
            thousandSeparator=","
            hideControls
            inputMode="decimal"
            size="lg"
            style={{ flex: 1 }}
            data-autofocus={!isEdit || undefined}
            styles={{
              label: { fontSize: 'var(--mantine-font-size-sm)' },
              input: { fontWeight: 700, color: mode === 'income' ? 'var(--mm-income)' : mode === 'expense' ? 'var(--mm-expense)' : undefined },
            }}
          />
          {showCurrency && (
            <Select
              data={CURRENCIES}
              value={currency}
              onChange={(v) => { const cur = v || HOME_CURRENCY; setCurrency(cur); loadRate(cur); }}
              allowDeselect={false}
              size="lg"
              w={104}
              aria-label="币种"
              comboboxProps={{ withinPortal: true }}
            />
          )}
        </Group>

        {foreign && (
          <Text size="sm" c={rateError ? 'red' : 'dimmed'} mt={-8}>
            {rateLoading && '正在查询实时汇率…'}
            {!rateLoading && rateError && (
              <>{rateError} <Button variant="subtle" size="compact-xs" onClick={() => loadRate(currency)}>重试</Button></>
            )}
            {!rateLoading && !rateError && rate && (
              <>汇率 1 {currency} = {rate.toFixed(4)} CAD{converted != null && <>，约合 <b>{fmt(converted)}</b></>}</>
            )}
            {!rateLoading && !rateError && !rate && '保存时会按实时汇率换算成 CAD'}
          </Text>
        )}
        {editForeign && (
          <Text size="sm" c="dimmed" mt={-8}>
            {editRate
              ? <>按记账时的汇率 1 {tx.currency} = {editRate.toFixed(4)} CAD 换算{amount !== '' && <>，约合 <b>{fmt(Number(amount) * editRate)}</b></>}</>
              : '保存时会按实时汇率换算成 CAD'}
          </Text>
        )}

        <TextInput type="date" label="日期" required withAsterisk={false} value={date} onChange={(e) => setDate(e.target.value)} />

        {isNewTransfer ? (
          <>
            <Group grow gap="xs" align="flex-start">
              <AccountSelect label="转出账户" placeholder="选择账户" accounts={accounts} value={fromId} onChange={handleFromChange} clearable={false} />
              <AccountSelect label="转入账户" placeholder="选择账户" accounts={accounts} value={toId} onChange={handleToChange} clearable={false} />
            </Group>
            {crossCurrency && (
              <NumberInput
                label={`转入金额（${toCcy}）`}
                description={xferRate
                  ? `按实时汇率约 ${suggestedTo != null ? suggestedTo.toFixed(2) : '—'} ${toCcy}，不填就按这个算；可以改成银行实际到账的金额`
                  : '正在查询汇率…'}
                placeholder={suggestedTo != null ? suggestedTo.toFixed(2) : '0.00'}
                value={toAmount}
                onChange={setToAmount}
                decimalScale={2}
                min={0}
                allowNegative={false}
                thousandSeparator=","
                hideControls
                inputMode="decimal"
              />
            )}
          </>
        ) : (
          <>
            {!isTransferEdit && (
              <Input.Wrapper label="分类">
                <div style={{ marginTop: 4 }}>
                  <CategoryPicker categories={categories} type={mode} value={categoryId} onChange={setCategoryId} />
                </div>
              </Input.Wrapper>
            )}
            <AccountSelect label="账户" accounts={accounts} value={accountId} onChange={handleAccountChange} />
          </>
        )}

        <TextInput label="备注" placeholder="选填" value={description} onChange={(e) => setDescription(e.target.value)} />

        <Group gap="sm" grow>
          {isEdit && (
            <Button variant="light" color="red" leftSection={<IconTrash size={18} />} onClick={handleDelete}>
              删除
            </Button>
          )}
          <Button type="submit" color={MODE_COLOR[mode] === 'gray' ? 'dark' : MODE_COLOR[mode]} loading={saving}>
            {isEdit ? '保存' : isNewTransfer ? '确认转账' : '保存'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * 记一笔 / 编辑记录的抽屉：手机上从底部弹出，电脑上从右边滑出。
 * formKey 每次打开都要变，这样表单状态会按新的 tx / 默认值重新初始化。
 */
export default function TransactionDrawer({ opened, onClose, onSaved, tx, defaultDate, defaultMode = 'expense', defaultAccountId, formKey }) {
  const isMobile = useMediaQuery('(max-width: 47.99em)');
  const title = tx ? '编辑记录' : defaultMode === 'transfer' ? '转账' : '记一笔';
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={700}>{title}</Text>}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '92%' : 440}
      styles={isMobile ? { content: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } } : undefined}
    >
      <TransactionForm
        key={formKey}
        tx={tx}
        defaultDate={defaultDate}
        defaultMode={defaultMode}
        defaultAccountId={defaultAccountId}
        onDone={(changed) => {
          onClose();
          if (changed) onSaved?.();
        }}
      />
    </Drawer>
  );
}
