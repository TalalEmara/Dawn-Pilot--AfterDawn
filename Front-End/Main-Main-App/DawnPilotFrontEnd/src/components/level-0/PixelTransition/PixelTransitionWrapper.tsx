import PixelTransition from "./PixelTransition";

interface PixelTransitionWrapperProps {
  image: string;
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

function PixelTransitionWrapper({ image, className, onClick, children }: PixelTransitionWrapperProps) {
  
  return (
    <div onClick={onClick}>
      <PixelTransition
        firstContent={
          <>
            <img
              src={image}
              alt={image.split('/').pop()?.split('.')[0] || 'add model'}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {children}
          </>
        }
        secondContent={
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              backgroundColor: "var(--secondary-color, #fff)",
              color: "#fff",
              fontSize: "2rem",
              fontWeight: "bold",
            }}
          >
            Car
          </div>
        }
        gridSize={12}
        pixelColor='#FAFDF6'
        animationStepDuration={0.4}
        className={className}
      />
    </div>
  );
}

export default PixelTransitionWrapper;