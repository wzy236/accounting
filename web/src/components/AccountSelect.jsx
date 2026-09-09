export default function AccountSelect({ accounts, value, onChange, className }) {
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">不选择</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name}{a.type === 'credit_card' ? '（信用卡）' : ''}</option>
      ))}
    </select>
  );
}
