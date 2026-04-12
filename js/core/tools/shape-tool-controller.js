window.ShapeToolController = class ShapeToolController {
  constructor(shapeType, context) {
    this.shapeType = shapeType;
    this.context = context;
    this._startPoint = null;
  }

  activate() {
    this._cancel();
  }

  deactivate() {
    this._cancel();
  }

  pointerDown(point) {
    if (!point) return;

    const preview = this.context.shape.startPreview(this.shapeType, point);
    this._startPoint = preview ? point : null;
  }

  pointerMove(point) {
    if (!this._startPoint || !point) return;

    this.context.shape.updatePreview(this.shapeType, this._startPoint, point);
  }

  pointerUp() {
    if (!this._startPoint) return false;

    const committed = this.context.shape.commitPreview(this.shapeType);
    this._startPoint = null;
    return committed;
  }

  _cancel() {
    this.context.shape.cancelPreview(this.shapeType);
    this._startPoint = null;
  }
};