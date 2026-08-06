/**
 * Tiny external store (useSyncExternalStore-compatible) standing in for
 * Redux/Zustand. The inspector's State tab reads it via getStateSnapshot.
 */

export interface DemoState {
  clicks: number;
  cart: { name: string; price: number }[];
  cartTotal: number;
}

type Listener = () => void;

let state: DemoState = { clicks: 0, cart: [], cartTotal: 0 };
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export const demoStore = {
  getState: (): DemoState => state,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  addToCart(name: string, price: number) {
    const cart = [...state.cart, { name, price }];
    state = {
      clicks: state.clicks + 1,
      cart,
      cartTotal: cart.reduce((sum, item) => sum + item.price, 0),
    };
    emit();
  },
};
