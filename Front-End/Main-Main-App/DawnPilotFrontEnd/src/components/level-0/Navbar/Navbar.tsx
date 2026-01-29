import styles from "./Navbar.module.css"

export interface NavTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}

interface NavbarProps {
  tabs: NavTab[];
  activeTabId?: string;
  onTabClick: (tabId: string) => void;
}

function Navbar({ tabs, activeTabId, onTabClick }: NavbarProps) {
  return (
    <nav className={styles.navbar} role="navigation" aria-label="Sidebar navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.navButton} ${activeTabId === tab.id ? styles.active : ''}`}
          onClick={() => onTabClick(tab.id)}
          disabled={tab.disabled}
          aria-label={tab.ariaLabel || tab.label}
          aria-current={activeTabId === tab.id ? 'page' : undefined}
        >
          {tab.icon && <span className={styles.icon}>{tab.icon}</span>}
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default Navbar