# Depth Endpoint - Quick Reference

## Endpoint
**POST** `/api/process-with-depth`

## Purpose
Process RGB image with VR/WebGL Z-buffer depth map for depth-aware phosphene vision. Automatically prioritizes closer objects.

---

## Request Format

### Headers
```
Content-Type: application/json
```

### Body
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQ...",
  "depth_map_base64": "data:image/png;base64,iVBOR...",
  "depth_sampling": "median",
  "conf_threshold": 0.5,
  "t_min": 0.3,
  "k_min": 1,
  "k_max": 5
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image_base64` | string | ✅ | - | Base64 RGB image (with/without data URL prefix) |
| `depth_map_base64` | string | ✅ | - | Base64 depth/Z-buffer map |
| `depth_sampling` | string | ❌ | `"median"` | Sampling method: `median`, `centroid`, `min`, `mean` |
| `conf_threshold` | float | ❌ | `0.5` | YOLO detection confidence (0.0-1.0) |
| `t_min` | float | ❌ | `0.3` | Minimum score threshold |
| `k_min` | int | ❌ | `1` | Minimum objects to select |
| `k_max` | int | ❌ | `5` | Maximum objects to select |

---

## Depth Sampling Methods

| Method | Speed | Use Case | Description |
|--------|-------|----------|-------------|
| **`median`** | Medium | **Default/Recommended** | Robust to noise, outliers in Z-buffer |
| `centroid` | Fast | Speed-critical | Depth at object center point |
| `min` | Medium | Obstacle avoidance | Closest point in bbox (conservative) |
| `mean` | Medium | Smooth scenes | Average depth in bbox |

---

## Response Format

```json
{
  "detections": [
    {
      "class": "person",
      "confidence": 0.87,
      "bbox": [100, 150, 200, 180],
      "centroid_px": [200, 240],
      "distance_m": 2.3
    }
  ],
  "phosphene_image": "base64_encoded_phosphene_representation...",
  "metadata": {
    "detection_count": 5,
    "depth_assigned_count": 5,
    "depth_sampling_method": "median",
    "timing_breakdown": {
      "total_ms": 245.67,
      "image_decode_ms": 12.34,
      "depth_decode_ms": 8.91,
      "detection_ms": 150.23,
      "depth_assignment_ms": 5.12,
      "translation_ms": 45.67,
      "encode_ms": 23.40
    }
  }
}
```

---

## Depth Map Formats

### Supported Formats
- ✅ **PNG/JPEG grayscale** (8-bit, 16-bit) - auto-normalized to meters
- ✅ **Raw Float32 numpy array** - base64 encoded
- ✅ **EXR format** - 32-bit float depth

### Three.js Integration Example

```javascript
// Render depth buffer from Three.js scene
const depthMaterial = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking
});

function renderDepthBuffer(scene, camera) {
  const renderTarget = new THREE.WebGLRenderTarget(width, height);
  scene.overrideMaterial = depthMaterial;
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
  
  // Read pixels and convert to PNG
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  return pixelsToBase64PNG(pixels);
}

// Send to API
const response = await fetch('http://localhost:8000/api/process-with-depth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_base64: rgbFrameBase64,
    depth_map_base64: renderDepthBuffer(scene, camera),
    depth_sampling: 'median',
    conf_threshold: 0.5,
    k_max: 5
  })
});
```

---

## Postman Examples

### 1. Median Sampling (Recommended)
```json
POST http://localhost:8000/api/process-with-depth

{
  "image_base64": "data:image/jpeg;base64,...",
  "depth_map_base64": "data:image/png;base64,...",
  "depth_sampling": "median",
  "conf_threshold": 0.5,
  "t_min": 0.3,
  "k_min": 1,
  "k_max": 5
}
```

### 2. VR Real-Time Navigation
```json
POST http://localhost:8000/api/process-with-depth

{
  "image_base64": "data:image/jpeg;base64,...",
  "depth_map_base64": "data:image/png;base64,...",
  "depth_sampling": "median",
  "conf_threshold": 0.6,
  "t_min": 0.4,
  "k_min": 2,
  "k_max": 5
}
```

### 3. Obstacle Avoidance (Conservative)
```json
POST http://localhost:8000/api/process-with-depth

{
  "image_base64": "data:image/jpeg;base64,...",
  "depth_map_base64": "data:image/png;base64,...",
  "depth_sampling": "min",
  "conf_threshold": 0.7,
  "t_min": 0.5,
  "k_min": 1,
  "k_max": 3
}
```

---

## Performance

### Typical Timing (640x480)
- **Total:** ~246ms
- **Detection:** ~150ms (61%)
- **Translation:** ~46ms (19%)
- **Depth Assignment:** ~5ms (2%)
- **Overhead:** Minimal (~2%)

**Real-time capable at 500ms VR frame intervals** ✅

---

## Error Handling

### Common Errors

**400 Bad Request - Invalid depth data**
```json
{
  "detail": "Invalid depth map data: could not decode"
}
```
→ Check depth map format and encoding

**400 Bad Request - Size mismatch**
```json
{
  "detail": "Depth map size (640x480) doesn't match image (1280x720)"
}
```
→ Resize depth map to match image dimensions

**503 Service Unavailable**
```json
{
  "detail": "Detector not initialized"
}
```
→ Wait for detector to load (check `/api/health`)

---

## How Depth Prioritization Works

The translator automatically prioritizes closer objects:

```python
# From translator.py line 164
dist = float(obj.get("distance_m", obj.get("depth", obj.get("depth_z", 10.0))))
spatial_score = 1.0 / (1.0 + dist)  # Closer = higher priority
```

**Example:**
- Person at 2m → score 0.333 → HIGH priority ⭐⭐⭐
- Car at 5m → score 0.167 → MEDIUM priority ⭐⭐
- Building at 15m → score 0.063 → LOW priority ⭐

With `k_max=2`, person and car are selected first.

---

## Testing

### Quick Test
```bash
# See DEPTH_INTEGRATION_GUIDE.md for full test suite
python test_depth_integration.py
```

### Manual Test with cURL
```bash
curl -X POST http://localhost:8000/api/process-with-depth \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "data:image/jpeg;base64,...",
    "depth_map_base64": "data:image/png;base64,...",
    "depth_sampling": "median"
  }'
```

---

## See Also
- **Full Integration Guide:** `DEPTH_INTEGRATION_GUIDE.md`
- **API Documentation:** `API_README.md`
- **Postman Collection:** `postman_phosphene_collection.json`
- **Implementation:** `phosphene_api.py` (lines 1084+)
