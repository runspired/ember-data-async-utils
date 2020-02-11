import Helper from' @ember/component/helper';
import { tracked } from '@glimmer/component';
import { resolve } from 'rsvp';

const PromiseStateCache = new WeakMap();

class PromiseState {
  @tracked isRejected;
  @tracked isResolved;

  get isPending() {
    return !this.isRejected && !this.isResolved;
  }

  @tracked value;
  @tracked error;
}

function getState(helper) {
  let state = PromiseStateCache.get(helper);
  if (state === undefined) {
    state = new PromiseState();
    PromiseStateCache.set(helper, state);
  }
  return state;
}

function isThenable(maybePromise) {
  return maybePromise && typeof maybePromise.then === 'function';
}

function isPromiseProxy(thenable) {
  return isThenable(thenable.promise);
}

function awaitThenable(state, promise) {
  let token = { cancelled: false };
  resolve(promise)
    .then(
      value => {
        if (token.cancelled) {
          return;
        }
        state.value = value;
        state.isResolved = true;
      },
      (error) => {
        if (token.cancelled) {
          return;
        }
        state.error = error;
        state.isRejected = true;
      }
    );
  return token;
}

export default class AwaitHelper extends Helper {

  compute([maybePromise]) {
    let currentInputValue = this.currentInputValue;
    let state = getState(this);
    let isPromise = isThenable(maybePromise);

    // unwrap promise proxies
    if (isPromise) {
      if (isPromiseProxy(maybePromise)) {
        maybePromise = get(maybePromise, 'promise');
      }
    }

    // do nothing
    if (currentInputValue === maybePromise) {
      return state;
    }

    // we are recomputing so kill off any existing requests
    if (this.token) {
      this.token.cancelled = true;
    }

    // we aren't a promise so just hand out the state
    if (!isPromise) {
      this.token = null;
      state.value = maybePromise;
      state.isResolved = true;
      state.isRejected = false;
      state.error = undefined;

      return state;
    }

    // we are a promise so clean any existing state and tap this new promise
    state.value = undefined;
    state.isResolved = false;
    state.isRejected = false;
    state.error = undefined;

    this.token = awaitThenable(state, maybePromise);
    return state;
  }

  willDestroy() {
    if (this.token) {
      this.token.cancelled = true;
    }
    super.willDestroy();
  }
}
