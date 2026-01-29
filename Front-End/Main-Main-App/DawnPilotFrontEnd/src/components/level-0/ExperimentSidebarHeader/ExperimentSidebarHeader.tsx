import styles from "./ExperimentSidebarHeader.module.css"
interface ExperimentSidebarHeaderProps {
  children?: React.ReactNode;
  isConnected: boolean;
  mobileId: string;
  aiConnected: boolean;
  subjectId?: string;
}

function ExperimentSidebarHeader({ 
  children, 
  isConnected, 
  mobileId, 
  aiConnected,
  subjectId = "6"
}: ExperimentSidebarHeaderProps) {
  return (
    <div className={styles.container}>
        <p className={styles.logo}>AfterDawn</p>
        <p className={styles.pageLabel}>Researcher Control</p>
        <p className={styles.subjectName}>Subject: {subjectId}</p>
        
        {/* Connection Status */}
        <div className={styles.statusLine}>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Laptop:</span>
            <span className={`${styles.statusIndicator} ${isConnected ? styles.online : styles.offline}`}>
              {isConnected ? "🟢" : "🔴"}
            </span>
          </div>
          <span className={styles.separator}>|</span>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Mobile:</span>
            <span className={`${styles.statusIndicator} ${mobileId ? styles.online : styles.offline}`}>
              {mobileId ? "🟢" : "🔴"}
            </span>
          </div>
          <span className={styles.separator}>|</span>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>AI:</span>
            <span className={`${styles.statusIndicator} ${aiConnected ? styles.online : styles.offline}`}>
              {aiConnected ? "🟢" : "🔴"}
            </span>
          </div>
        </div>
        
        {children}
    </div>
  )
}

export default ExperimentSidebarHeader