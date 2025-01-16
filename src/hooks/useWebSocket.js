import { useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

function useWebSocket({ onCanvasMessage, onChatMessage, onCursorMessage, onCursorRemoveMessage }) {
  const clientRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef(null);

  const connect = () => {
    if (clientRef.current?.connected) {
      console.log('이미 연결되어 있습니다.');
      return;
    }

    const stompClient = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      reconnectDelay: 0,
      onConnect: () => {
        console.log('WebSocket 연결 성공');
        reconnectAttempts.current = 0;

        stompClient.subscribe('/topic/canvas', (message) => onCanvasMessage?.(JSON.parse(message.body)));
        stompClient.subscribe('/topic/chat', (message) => onChatMessage?.(JSON.parse(message.body)));
        stompClient.subscribe('/topic/cursors', (message) => onCursorMessage?.(JSON.parse(message.body)));
        stompClient.subscribe('/topic/cursors/remove', (message) => onCursorRemoveMessage?.(JSON.parse(message.body)));
        clientRef.current = stompClient;
      },
      onStompError: (frame) => {
        console.error('STOMP 오류:', frame);
        handleDisconnect();
      },
      onWebSocketError: (event) => {
        console.error('WebSocket 오류:', event);
        handleDisconnect();
      },
      onDisconnect: () => {
        console.log('WebSocket 연결 해제');
        handleDisconnect();
      }
    });

    stompClient.activate();
  };

  const handleDisconnect = () => {
    clientRef.current = null;
    if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts.current++;
      console.log(`재연결 시도 ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}`);
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = setTimeout(() => connect(), RECONNECT_DELAY);
    } else {
      console.error('최대 재연결 시도 횟수 초과');
    }
  };

  const disconnect = () => {
    if (clientRef.current?.connected) {
      clientRef.current.deactivate();
    }
    clearTimeout(reconnectTimeout.current);
  };

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { clientRef, connect, disconnect };
}

export default useWebSocket;