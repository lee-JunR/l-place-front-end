// src/hooks/useWebSocket.js

import { useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

/**
 * 커스텀 훅: STOMP 웹소켓을 통해 Canvas, Chat, Cursor 등 데이터를 주고받는 로직을 관리.
 *
 * @param {Object} options
 *  - backendUrl: 백엔드 WebSocket 엔드포인트 (예: process.env.REACT_APP_BACKEND_API_URL)
 *  - usernameRef: 사용자 이름을 저장한 useRef 객체 (커서 제거 시 etc.)
 *  - onCanvasUpdate: (parsedMessage) => {}  // 캔버스 데이터 업데이트 콜백
 *  - onChatUpdate: (chatMessage) => {}      // 채팅 메시지 업데이트 콜백
 *  - onCursorUpdate: (cursorData) => {}     // 커서 위치 업데이트 콜백
 *  - onCursorRemove: (removedUsername) => {}// 커서 제거 콜백
 *  - generateRandomColor:  // 커서 색상 생성 함수 (선택)
 *  - chatContainerRef:  // 채팅 스크롤 영역 ref (선택)
 *
 * @returns {Object} {
 *   clientRef,  // stompClient를 가리키는 ref
 *   connect,    // 명시적 연결 함수 (App.js에서 호출)
 *   disconnect, // 명시적 해제 함수 (App.js에서 호출)
 * }
 */

export function useWebSocket({
  backendUrl,
  usernameRef,
  onCanvasUpdate,
  onChatUpdate,
  onCursorUpdate,
  onCursorRemove,
  generateRandomColor,
  chatContainerRef,
}) {
  const clientRef = useRef(null);           // stompClient 보관
  const subscriptionsRef = useRef(new Set()); // 구독 목록 (나중에 일괄 해제)

  const connect = () => {
    if (clientRef.current) {
      console.log('이미 WebSocket 연결이 존재합니다.');
      return;
    }

    // STOMP Client 생성
    const stompClient = new Client({
      webSocketFactory: () => new SockJS(`${backendUrl}/ws`),
      reconnectDelay: 5000, // 재연결 딜레이
      onConnect: () => {
        console.log('WebSocket 연결됨');

        // 혹시 남아있는 구독이 있다면 해제
        subscriptionsRef.current.forEach((sub) => sub.unsubscribe());
        subscriptionsRef.current.clear();

        // (1) 캔버스 구독
        const canvasSub = stompClient.subscribe('/topic/canvas', (message) => {
          if (!onCanvasUpdate) return;
          const parsedMessage = JSON.parse(message.body);
          onCanvasUpdate(parsedMessage);
        });
        subscriptionsRef.current.add(canvasSub);

        // (2) 채팅 구독
        const chatSub = stompClient.subscribe('/topic/chat', (message) => {
          if (!onChatUpdate) return;
          const chatMessage = JSON.parse(message.body);
          onChatUpdate(chatMessage);

          // 자동 스크롤
          if (chatContainerRef?.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        });
        subscriptionsRef.current.add(chatSub);

        // (3) 커서 위치 구독
        const cursorSub = stompClient.subscribe('/topic/cursors', (message) => {
          if (!onCursorUpdate) return;
          const cursorData = JSON.parse(message.body);
          onCursorUpdate(cursorData);
        });
        subscriptionsRef.current.add(cursorSub);

        // (4) 커서 제거 구독
        const cursorRemoveSub = stompClient.subscribe('/topic/cursors/remove', (message) => {
          if (!onCursorRemove) return;
          const removedUsername = JSON.parse(message.body);
          onCursorRemove(removedUsername);
        });
        subscriptionsRef.current.add(cursorRemoveSub);
      },
      onDisconnect: () => {
        console.log('WebSocket 연결 해제됨');
      },
      onStompError: (frame) => {
        console.error('STOMP 에러:', frame);
      },
    });

    // 실제 연결 수행
    clientRef.current = stompClient;
    stompClient.activate();
  };

  const disconnect = () => {
    if (clientRef.current?.connected) {
      clientRef.current.deactivate();
      clientRef.current = null;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && clientRef.current) {
        clientRef.current.publish({
          destination: '/app/cursors/remove',
          body: JSON.stringify({ username: usernameRef.current }),
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 언마운트 시 WebSocket 해제
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      disconnect(); // 컴포넌트 언마운트 시 WS 해제
    };
    // eslint-disable-next-line
  }, []);

  return {
    clientRef,   // 필요한 경우 App.js 등에서 직접 publish할 때 사용
    connect,     // App.js에서 onMount 시 connect() 호출
    disconnect,  // App.js에서 onUnmount 시 disconnect() 호출
  };
}