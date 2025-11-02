# Frontend Refactor - Single Responsibility Architecture

## 🎯 Overview

The frontend has been refactored following the **Single Responsibility Principle** using custom React hooks. Each hook manages one specific concern, making the code more maintainable, testable, and reusable.

---

## 📁 File Structure

```
src/
├── hooks/
│   ├── useScenarioWorld.ts      # World state management
│   ├── useEntityManager.ts      # Entity CRUD operations
│   ├── useComponentManager.ts   # Component operations
│   ├── useModelLibrary.ts       # Model definitions
│   └── useAFrameSync.ts         # A-Frame scene synchronization
├── contexts/
│   └── ScenarioContext.tsx      # Global state context
├── pages/
│   └── BuilderPage.tsx          # Main page (orchestrator)
└── components/
    └── BuilderSidePanel.tsx     # UI component
```

---

## 🔧 Hook Responsibilities

### **1. useScenarioWorld**
**Responsibility:** Manage world-level state and operations

**What it does:**
- Loads the entire scenario world from backend
- Creates new empty worlds (reset functionality)
- Maintains world state (entities array)
- Provides loading and error states

**API Endpoints:**
- `GET /scenario-world` - Load world
- `POST /scenario-worlds` - Create new world

**Usage:**
```typescript
const { world, loading, loadWorld, createNewWorld } = useScenarioWorld();
```

---

### **2. useEntityManager**
**Responsibility:** Handle entity CRUD operations

**What it does:**
- Create entities from model templates
- Create custom entities with specific components
- Delete entities by ID
- Query entities by component types
- Triggers world reload after mutations

**API Endpoints:**
- `POST /entities/from-model` - Create from template
- `POST /entities` - Create custom entity
- `GET /entities/:id` - Get entity
- `DELETE /entities/:id` - Delete entity
- `POST /entities/query` - Query by components

**Usage:**
```typescript
const { createEntityFromModel, deleteEntity } = useEntityManager(
  (updatedEntities) => setWorld({ entities: updatedEntities })
);

await createEntityFromModel({
  modelName: 'Car',
  overrides: { Position: { x: 5, y: 0, z: -4 } }
});
```

---

### **3. useComponentManager**
**Responsibility:** Manage component-level operations

**What it does:**
- Add components to entities
- Update components (immediate or debounced)
- Remove components from entities
- Provides debouncing for frequent updates (dragging)
- Manages update timers for cleanup

**API Endpoints:**
- `POST /entities/:id/components/:name` - Add component
- `PUT /entities/:id/components/:name` - Update component
- `DELETE /entities/:id/components/:name` - Remove component

**Usage:**
```typescript
const { updateComponentDebounced, clearAllTimers } = useComponentManager();

// Debounced update (for dragging)
updateComponentDebounced(entityId, 'Position', { x: 10, y: 0, z: -5 }, 500);
```

---

### **4. useModelLibrary**
**Responsibility:** Fetch and manage model definitions

**What it does:**
- Loads available model templates from backend
- Provides model lookup by name
- Checks if models exist
- Auto-loads on mount

**API Endpoints:**
- `GET /models` - Get all model definitions

**Usage:**
```typescript
const { models, getModelByName, modelExists } = useModelLibrary();

if (modelExists('Car')) {
  const carModel = getModelByName('Car');
}
```

---

### **5. useAFrameSync**
**Responsibility:** Synchronize A-Frame scene with backend

**What it does:**
- Sets up event listeners on A-Frame entities
- Maps A-Frame indices to backend entity IDs
- Watches for component changes (position, rotation, scale, color)
- Converts A-Frame component names to backend format
- Triggers callbacks when components change
- Cleans up listeners on unmount

**No API calls** (delegates to component manager)

**Usage:**
```typescript
useAFrameSync(world.entities, {
  onComponentChange: (entityId, componentName, data) => {
    updateComponentDebounced(entityId, componentName, data);
  },
  watchedComponents: ['position', 'rotation', 'scale']
});
```

---

## 🔄 Data Flow

### **Entity Creation Flow**
```
User clicks "Add Car" button
  ↓
BuilderSidePanel calls addEntity('Car', overrides)
  ↓
useEntityManager.createEntityFromModel()
  ↓
POST /entities/from-model
  ↓
Backend creates entity with components
  ↓
Hook reloads world: GET /scenario-world
  ↓
useScenarioWorld.setWorld() updates state
  ↓
BuilderPage re-renders A-Frame scene
  ↓
New entity appears in 3D scene
```

### **Component Update Flow (Interactive Editing)**
```
User drags entity in A-Frame scene
  ↓
A-Frame fires 'componentchanged' event
  ↓
useAFrameSync catches event
  ↓
Maps A-Frame index → backend entity ID
  ↓
Converts 'position' → 'Position'
  ↓
Calls onComponentChange callback
  ↓
useComponentManager.updateComponentDebounced()
  ↓
Waits 500ms for changes to settle
  ↓
PUT /entities/:id/components/Position
  ↓
Backend updates component
  ↓
Change persisted (no UI update needed)
```

---

## 🎨 Component Mapping

### **A-Frame ↔ Backend Component Names**
```javascript
{
  'position' → 'Position',
  'rotation' → 'Rotation',
  'scale' → 'Scale',
  'color' → 'Color'
}
```

### **Component Data Structures**
```typescript
// A-Frame format
position: { x: 0, y: 0, z: 0 }

// Backend format (same structure)
Position: { x: 0, y: 0, z: 0 }

// Color is special
color: "#FF0000"  // A-Frame
Color: { value: "#FF0000" }  // Backend
```

---

## 🏗️ Context Pattern

### **ScenarioContext**
Provides global access to:
- World state
- Model library
- Loading/error states
- CRUD operations

**Why use context?**
- Avoids prop drilling through multiple layers
- Centralizes scenario management
- Makes state accessible to any component
- Maintains single source of truth

---

## ✅ Single Responsibility Benefits

### **Before Refactor:**
- BuilderPage: 200+ lines
- Mixed concerns: API calls, state, UI, A-Frame sync
- Hard to test individual features
- Difficult to reuse logic

### **After Refactor:**
- BuilderPage: ~100 lines (orchestrator only)
- Each hook: 50-150 lines (single concern)
- Easy to test hooks independently
- Hooks reusable across components
- Clear separation of concerns

---

## 🧪 Testing Strategy

Each hook can be tested independently:

```typescript
// Test useEntityManager
test('creates entity from model', async () => {
  const { result } = renderHook(() => useEntityManager(mockCallback));
  
  await act(async () => {
    await result.current.createEntityFromModel({
      modelName: 'Car',
      overrides: { Position: { x: 5 } }
    });
  });
  
  expect(mockFetch).toHaveBeenCalledWith('/entities/from-model', ...);
  expect(mockCallback).toHaveBeenCalled();
});
```

---

## 🚀 Usage Examples

### **Adding a Car**
```typescript
const { addEntity } = useScenario();

await addEntity('Car', {
  Position: { x: 0, y: 0.5, z: -4 },
  Scale: { x: 0.06, y: 0.06, z: 0.06 }
});
```

### **Querying Entities**
```typescript
const { queryEntities } = useScenario();

// Get all entities with Position and Model components
const movableEntities = await queryEntities(['Position', 'Model']);
```

### **Removing Component**
```typescript
const { removeComponent } = useComponentManager();

await removeComponent(entityId, 'Color');
```

---

## 🔐 Error Handling

Each hook includes:
- Try-catch blocks around API calls
- Error state management
- Console logging for debugging
- User-friendly error messages

```typescript
const { error } = useEntityManager();

if (error) {
  console.error('Entity error:', error);
  alert(`Error: ${error}`);
}
```

---

## 🧹 Cleanup

Proper cleanup prevents memory leaks:

```typescript
useEffect(() => {
  loadWorld();
  
  return () => {
    clearAllTimers(); // Clear debounce timers
  };
}, [loadWorld, clearAllTimers]);
```

---

## 📝 Migration Checklist

- [x] Create specialized hooks for each concern
- [x] Refactor BuilderPage to use hooks
- [x] Update ScenarioContext interface
- [x] Refactor BuilderSidePanel to use context
- [x] Add proper TypeScript types
- [x] Implement error handling
- [x] Add cleanup logic
- [x] Document API integration

---

## 🎯 Next Steps

1. **Add more model types** to BuilderSidePanel
2. **Implement entity selection** in A-Frame
3. **Add component editor UI** (position, rotation, scale inputs)
4. **Create system hooks** for game logic (physics, collision)
5. **Add undo/redo functionality** using command pattern
6. **Implement world save/load** (persistent storage)

---

## 💡 Best Practices

1. **Keep hooks focused** - One responsibility per hook
2. **Use callbacks** for side effects (world updates)
3. **Debounce frequent updates** - Avoid API spam
4. **Map indices carefully** - A-Frame ↔ Backend entity IDs
5. **Clean up listeners** - Prevent memory leaks
6. **Handle errors gracefully** - User-friendly messages
7. **Type everything** - TypeScript for safety
8. **Document your hooks** - JSDoc comments

---

## 🐛 Common Issues

**Issue:** A-Frame changes not syncing to backend
- Check entity ID mapping in useAFrameSync
- Verify component name conversion
- Check debounce timing

**Issue:** World not updating after entity creation
- Ensure onWorldUpdate callback is provided
- Check if GET /scenario-world is called after mutations

**Issue:** Memory leaks
- Always clean up timers in useEffect cleanup
- Remove event listeners on unmount

---

## 📚 References

- [React Hooks Docs](https://react.dev/reference/react)
- [A-Frame Events](https://aframe.io/docs/1.4.0/core/entity.html#events)
- [ECS Pattern](https://en.wikipedia.org/wiki/Entity_component_system)
