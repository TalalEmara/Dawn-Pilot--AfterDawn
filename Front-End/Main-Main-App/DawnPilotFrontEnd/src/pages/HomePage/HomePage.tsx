import styles from './HomePage.module.css'
import TextTrail from '../../components/level-0/TextTrail/TextTrail'
function HomePage( {onClick}: any) {
  return (
    <div className={styles.homePage}>   
        <h1 className={styles.heading}>Welcome to</h1>  
        <TextTrail text="DawnPilot" fontFamily='Aptos, system-ui, -apple-system, sans-serif'  fontWeight={500} textColor='#FB8500' />
        <p className={styles.subHeading}>Dawn is not the end of night — it’s the start of vision.
At AfterDawn, we design experiences, systems, and technologies that illuminate what comes next.</p>  
       <button onClick={() => onClick("Researcher")} className={styles.ResearcherButton}>Researcher</button>
        <button className={styles.SubjectButton}>Subject</button>
    </div>
  )
}

export default HomePage