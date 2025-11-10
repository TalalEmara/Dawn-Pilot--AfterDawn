import { useState } from "react";
import styles from "./PropertiesPanel.module.css";
import ComponentInput from "../../level-0/ComponentInput/ComponentInput";
import DawnButton from "../../level-0/DawnButton/DawnButton";
import { useCreateEntityFromModel } from "../../../hooks/ScenarioWorld/useCreateEntityFromModel";

interface PropertiesPanelProps {
  modelName: string;
}
function PropertiesPanel({modelName}: PropertiesPanelProps) {
  const [values, setValues] = useState({
    Position: { x: 0, y: 0, z: 0 },
    Rotation: { x: 0, y: 0, z: 0 },
    Scale: { x: 1, y: 1, z: 1 },
  });

  const createEntity = useCreateEntityFromModel();

  const handleChange = (label: string, value: any) => {
    setValues((prev) => ({ ...prev, [label]: value }));
  };

  const handleApply = () => {
    createEntity.mutate(
      {
        modelName: modelName,
        overrides: values,
      },
      {
        onSuccess: (data) => {
          console.log("✅ Entity created:", data.entity);
          // alert(data.message);
        },
        onError: (error: any) => {
          console.error("❌ Error creating entity:", error);
          alert("Failed to create entity!");
        },
      }
    );
  };

  const handleDiscard = () => {
    setValues({
      Position: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
    });
    console.log("Discarded");
  };

  return (
    <div className={styles.panelContainer}>
      <p className={styles.panelTitle}>Properties Panel</p>

      <ComponentInput
        type="Vector3"
        label="Position"
        value={values.Position}
        onChange={(val) => handleChange("Position", val)}
      />
      <ComponentInput
        type="Vector3"
        label="Rotation"
        value={values.Rotation}
        onChange={(val) => handleChange("Rotation", val)}
        max={360}
        min={-360}
      />
      <ComponentInput
        type="Vector3"
        label="Scale"
        value={values.Scale}
        onChange={(val) => handleChange("Scale", val)}
      />

      <div className={styles.buttonRow}>
        <DawnButton
          label={createEntity.isPending ? "Applying..." : "Apply Changes"}
          onClick={handleApply}
          disabled={createEntity.isPending}
        />
        <DawnButton
          classType="secondary"
          label="Discard"
          onClick={handleDiscard}
        />
      </div>
    </div>
  );
}

export default PropertiesPanel;
