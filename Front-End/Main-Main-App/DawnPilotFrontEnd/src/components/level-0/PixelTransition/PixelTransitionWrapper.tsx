import PixelTransition from "./PixelTransition";

interface PixelTransitionWrapperProps {
  image: string;
  className?: string;
}

function PixelTransitionWrapper({ image, className }: PixelTransitionWrapperProps) {
  return (
    <div onClick={()=>console.log("Oh")}>
      <PixelTransition
              firstContent={
                <img
                  src={image}
                 alt={image.split('/').pop()?.split('.')[0] || 'add model'}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              }
              secondContent={ <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "grid",
                                placeItems: "center",
                                backgroundColor: "#111",
                                color: "#fff",
                                fontSize: "2rem",
                                fontWeight: "bold",
                              }}
                            >
                              Car
                            </div>
                          }
              gridSize={12}
              pixelColor='#ffffff'
              animationStepDuration={0.4}
              className={className}
            />
    </div>
)}

export default PixelTransitionWrapper