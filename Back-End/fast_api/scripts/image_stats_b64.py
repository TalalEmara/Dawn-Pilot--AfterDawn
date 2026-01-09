import base64
from io import BytesIO
from PIL import Image

def analyze_base64_image(base64_string):
    # Remove the data URL prefix if present (e.g., "data:image/png;base64,")
    if "," in base64_string:
        base64_string = base64_string.split(",")[1]
    
    # Decode the base64 string
    image_data = base64.b64decode(base64_string)
    
    # Load the image from bytes
    image = Image.open(BytesIO(image_data))
    
    # Get dimensions
    width, height = image.size
    
    # Calculate aspect ratio (width:height simplified)
    from math import gcd
    divisor = gcd(width, height)
    aspect_ratio = f"{width // divisor}:{height // divisor}"
    
    # Resolution (DPI if available, else note it's not embedded)
    try:
        dpi = image.info.get('dpi', (72, 72))  # Default to 72 DPI if not set
        resolution = f"{dpi[0]}x{dpi[1]} DPI"
    except:
        resolution = "Resolution not embedded (default 72 DPI assumed)"
    
    return {
        "size": f"{width}x{height} pixels",
        "resolution": resolution,
        "aspect_ratio": aspect_ratio
    }

# Example usage
base64_image = "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"  # Replace with actual string
result = analyze_base64_image(base64_image)
print(result)