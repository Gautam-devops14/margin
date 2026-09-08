export default function TopBar({ userName }) {
  return (
    <div className="mobile-top-bar">
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--red)' }}>Margin<span style={{color: 'var(--ink)'}}>*</span></div>
      <div style={{ fontSize: '13px', color: 'var(--pencil)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>Hi, {userName}</span>
      </div>
    </div>
  );
}
