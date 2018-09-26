// @flow

import { Record } from 'immutable';
import moment from 'moment';

type ChatResponse = {
  date: string,
  destination_server_uuid: string,
  destination_user_uuid: string,
  direction: string,
  msg: string,
  source_server_uuid: string,
  source_user_uuid: string
};

type PlainMessageResponse = {
  msg: string,
  to: Array<string>,
  from: Array<string>
};

type Response = {
  items: Array<ChatResponse>
};

const uuid = () => {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);

  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

const ChatMessageRecord = Record({
  id: undefined,
  date: undefined,
  message: undefined,
  direction: undefined,
  destination: {
    serverId: undefined,
    userId: undefined
  },
  source: {
    serverId: undefined,
    userId: undefined
  },
  read: true
});

export default class ChatMessage extends ChatMessageRecord {
  id: string;
  date: moment;
  message: string;
  direction: string;
  destination: {
    serverId: string,
    userId: string
  };

  source: {
    serverId: string,
    userId: string
  };

  read: boolean;

  static parseMany(plain: Response): Array<ChatMessage> {
    return plain.items.map(item => ChatMessage.parse(item));
  }

  static parse(plain: ChatResponse): ChatMessage {
    return new ChatMessage({
      id: uuid(),
      date: moment(plain.date),
      message: plain.msg,
      direction: plain.direction,
      destination: {
        serverId: plain.destination_server_uuid,
        userId: plain.destination_user_uuid
      },
      source: {
        serverId: plain.source_server_uuid,
        userId: plain.source_user_uuid
      }
    });
  }

  static parseMessageSent(plain: PlainMessageResponse): ChatMessage {
    return new ChatMessage({
      id: uuid(),
      date: moment(),
      message: plain.msg,
      direction: 'sent',
      destination: {
        serverId: plain.to[0],
        userId: plain.to[1]
      },
      source: {
        serverId: plain.from[0],
        userId: plain.from[1]
      },
      read: true
    });
  }

  static parseMessageReceived(plain: PlainMessageResponse): ChatMessage {
    return new ChatMessage({
      id: uuid(),
      date: moment(),
      message: plain.msg,
      direction: 'received',
      destination: {
        serverId: plain.to[0],
        userId: plain.to[1]
      },
      source: {
        serverId: plain.from[0],
        userId: plain.from[1]
      },
      read: false
    });
  }

  is(other: ChatMessage) {
    return this.id === other.id;
  }

  isIncoming() {
    return this.direction === 'received';
  }

  acknowledge() {
    return this.set('read', true);
  }

  getTheOtherParty() {
    if (this.direction === 'sent') {
      return this.destination.userId;
    }
    return this.source.userId;
  }
}
