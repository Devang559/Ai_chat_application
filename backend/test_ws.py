import asyncio
import websockets
import json
import httpx

def main():
    print("Logging in...")
    r = httpx.post('http://127.0.0.1:8000/auth/login', json={'email':'testuser@example.com','password':'testpass123'}, timeout=60)
    print("Login status:", r.status_code)
    token = r.json()['session']['access_token']
    print("Token obtained")
    
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    conv = httpx.post('http://127.0.0.1:8000/chat/conversations', json={'title':'WS Test'}, headers=headers, timeout=60)
    print("Conv status:", conv.status_code)
    print("Conv body:", conv.text[:300])
    conv_id = conv.json()['id']
    print('Conversation:', conv_id)
    
    async def test_ws():
        uri = f'ws://127.0.0.1:8000/ws/chat/{conv_id}'
        try:
            async with websockets.connect(uri, close_timeout=10) as ws:
                print('WS Connected!')
                await ws.send(json.dumps({'token': token}))
                msg = await ws.recv()
                print('Auth:', msg[:300])
                await ws.send(json.dumps({'type': 'message', 'content': 'hi'}))
                full = ''
                while True:
                    m = await ws.recv()
                    d = json.loads(m)
                    if d.get('type') == 'chunk':
                        full += d.get('content', '')
                    elif d.get('type') == 'done':
                        print('Done:', full)
                        break
                    elif d.get('type') == 'error':
                        print('Error:', d.get('content'))
                        break
        except Exception as e:
            print('WS Error:', type(e).__name__, e)
    
    asyncio.run(test_ws())

if __name__ == '__main__':
    main()
