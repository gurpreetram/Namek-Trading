export default function NavTabs({ tabs, active, onChange }) {
  return (
    <div style={styles.nav}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            ...styles.tab,
            ...(active === t.key ? styles.tabActive : {}),
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  nav: {
    display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
    padding: '0 18px', overflowX: 'auto', gap: 0,
  },
  tab: {
    padding: '12px 16px', fontSize: 13, color: 'var(--text2)', background: 'none',
    border: 'none', borderBottom: '2px solid transparent', whiteSpace: 'nowrap',
  },
  tabActive: {
    color: 'var(--green)', borderBottomColor: 'var(--green)', fontWeight: 500,
  },
};
