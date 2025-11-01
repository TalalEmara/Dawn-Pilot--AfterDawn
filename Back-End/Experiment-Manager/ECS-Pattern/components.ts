import { Component } from "./ecsManager";

export class Position extends Component {
  constructor(public x = 0, public y = 0, public z = 0) { super(); }
}

export class Rotation extends Component {
  constructor(public x = 0, public y = 0, public z = 0) { super(); }
}
export class Scale extends Component {
  constructor(public x = 1, public y = 1, public z = 1) { super(); }
}
export class Model extends Component {
  constructor(public url = "/default.glb") { super(); }
}

export class Color extends Component {
  constructor(public value = "#ffffff") { super(); }
}