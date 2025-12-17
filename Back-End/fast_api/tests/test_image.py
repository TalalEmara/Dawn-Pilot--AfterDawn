from PIL import Image, ImageDraw

# 1. Create a 128x128 image with a black background
width, height = 128, 128
image = Image.new("RGB", (width, height), "black")

# 2. Create a drawing object
draw = ImageDraw.Draw(image)

# 3. Define the white object (a rectangle in the center)
# Let's make it 40x40 pixels
obj_size = 40
left = (width - obj_size) // 2
top = (height - obj_size) // 2
right = left + obj_size
bottom = top + obj_size

# Draw the white rectangle
draw.rectangle([left, top, right, bottom], fill="white")

# 4. Save the image
image.save("test_input_131.png")
print("Image saved as test_input_131.png")

# Optional: Show it immediately
image.show()