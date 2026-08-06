/** Box-model measurement for the DevInspector highlight overlay. */

export interface BoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoxModel {
  margin: BoxEdges;
  border: BoxEdges;
  padding: BoxEdges;
}

export function getBoxModel(el: Element): BoxModel {
  const cs = getComputedStyle(el);
  const px = (prop: string): number =>
    parseFloat(cs.getPropertyValue(prop)) || 0;
  const edges = (prefix: string, suffix = ""): BoxEdges => ({
    top: px(`${prefix}-top${suffix}`),
    right: px(`${prefix}-right${suffix}`),
    bottom: px(`${prefix}-bottom${suffix}`),
    left: px(`${prefix}-left${suffix}`),
  });
  return {
    margin: edges("margin"),
    border: edges("border", "-width"),
    padding: edges("padding"),
  };
}
