import {handleRelay,RelayRoom} from './lib/relay.mjs';
export {RelayRoom};

export default {
  async fetch(request) {
    return handleRelay(request);
  }
};
