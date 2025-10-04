
import ChromaGrid from '../../level-0/ChromaGrid/ChromaGrid';
import GlareHover from '../../level-0/GlareHover/GlareHover';
import styles from './BuilderSidePanel.module.css';
function BuilderSidePanel() {
    const items = [
  {
    image: "https://i.pravatar.cc/300?img=1",
    title: "Sarah Johnson",
    subtitle: "Frontend Developer",
    handle: "@sarahjohnson",
    borderColor: "#3B82F6",
    gradient: "linear-gradient(145deg, #3B82F6, #000)",
    url: "https://github.com/sarahjohnson"
  },
  {
    image: "https://i.pravatar.cc/300?img=2",
    title: "Mike Chen",
    subtitle: "Backend Engineer",
    handle: "@mikechen",
    borderColor: "#10B981",
    gradient: "linear-gradient(180deg, #10B981, #000)",
    url: "https://linkedin.com/in/mikechen"
  },
  {
    image: "https://i.pravatar.cc/300?img=2",
    title: "Mike Chen",
    subtitle: "Backend Engineer",
    handle: "@mikechen",
    borderColor: "#10B981",
    gradient: "linear-gradient(180deg, #10B981, #000)",
    url: "https://linkedin.com/in/mikechen"
  },
  {
    image: "https://i.pravatar.cc/300?img=2",
    title: "Mike Chen",
    subtitle: "Backend Engineer",
    handle: "@mikechen",
    borderColor: "#10B981",
    gradient: "linear-gradient(180deg, #10B981, #000)",
    url: "https://linkedin.com/in/mikechen"
  },{
    image: "https://i.pravatar.cc/300?img=2",
    title: "Mike Chen",
    subtitle: "Backend Engineer",
    handle: "@mikechen",
    borderColor: "#10B981",
    gradient: "linear-gradient(180deg, #10B981, #000)",
    url: "https://linkedin.com/in/mikechen"
  }
];
  return (
    <aside className={styles.panel}>
        {/* another component to be build */}
       <div className={styles.sideIconBar}>sss</div>

       <div className={styles.sideContent}>
        <p className={styles.heading}>Models</p>
        <div className={styles.modelList}>
        <GlareHover
        background='#000'
        glareColor="#ffffff"
        glareOpacity={0.3}
        glareAngle={-30}
        glareSize={300}
        transitionDuration={800}
        playOnce={false}
        className={styles.modelCard}>
            <p>ss</p>
        </GlareHover>
        <GlareHover
        background='black'
        glareColor="#ffffff"
        glareOpacity={0.3}
        glareAngle={-30}
        glareSize={300}
        transitionDuration={800}
        playOnce={false}
        className={styles.modelCard}>
            <p>ss</p>
        </GlareHover>
        <GlareHover
        background='#black'
        glareColor="#ffffff"
        glareOpacity={0.5}
        glareAngle={-30}
        glareSize={300}
        transitionDuration={500}
        playOnce={false}
        className={styles.modelCard}>
            <p>ss</p>
        </GlareHover>
        </div>
       </div>
    </aside>
  )
}

export default BuilderSidePanel