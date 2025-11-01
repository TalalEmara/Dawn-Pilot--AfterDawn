import { Entity } from "./types";

export class Component { /* marker base class */ }

// Map: entity -> (componentName -> componentInstance)
export class EntityManager {
  private nextId = 0;
  private components = new Map<Entity, Map<string, Component>>();

  createEntity(): Entity {
    const id = this.nextId++;
    this.components.set(id, new Map());
    return id;
  }

  removeEntity(entity: Entity): void {
    this.components.delete(entity);
  }

  addComponent(entity: Entity, component: Component): void {
    const m = this.components.get(entity);
    if (!m) throw new Error(`Entity ${entity} does not exist`);
    m.set(component.constructor.name, component);
  }

  removeComponent(entity: Entity, componentClass: Function): void {
    const m = this.components.get(entity);
    if (!m) return;
    m.delete(componentClass.name);
  }

  getComponent<T extends Component>(entity: Entity, type: new (...args: any[]) => T): T | undefined {
    const m = this.components.get(entity);
    if (!m) return undefined;
    return m.get(type.name) as T | undefined;
  }

  // returns entity ids which have ALL requested component classes
  getEntitiesWith(...types: (new (...args: any[]) => Component)[]): Entity[] {
    const out: Entity[] = [];
    for (const [entity, compMap] of this.components.entries()) {
      const ok = types.every(t => compMap.has(t.name));
      if (ok) out.push(entity);
    }
    return out;
  }

  // serialize world to plain JSON (for persistence / API)
  serialize(): any[] {
    const arr: any[] = [];
    for (const [entity, comps] of this.components.entries()) {
      const obj: any = { id: entity };
      for (const [name, instance] of comps.entries()) {
        // shallow copy - components should be plain data class instances
        obj[name] = { ...instance } as any;
      }
      arr.push(obj);
    }
    return arr;
  }

  // load serialized array produced by serialize()
  deserialize(list: any[]) {
    this.components.clear();
    this.nextId = 0;
    for (const item of list) {
      const id: Entity = item.id;
      if (typeof id === "number") {
        if (id >= this.nextId) this.nextId = id + 1;
        const map = new Map<string, Component>();
        for (const key of Object.keys(item)) {
          if (key === "id") continue;
          // raw data; components must be re-created by systems or route layer
          map.set(key, (item as any)[key] as Component);
        }
        this.components.set(id, map);
      }
    }
  }
}
