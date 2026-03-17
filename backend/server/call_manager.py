import asyncio
from typing import Dict, List
import json

class CallManager:
    def __init__(self):
        self.active_calls: Dict[str, dict] = {}
        self.user_connections: Dict[int, str] = {}  # user_id -> call_id
    
    def create_call(self, chat_id: int, initiator_id: int, call_type: str):
        call_id = f"call_{chat_id}_{initiator_id}_{int(asyncio.get_event_loop().time())}"
        
        call_data = {
            "id": call_id,
            "chat_id": chat_id,
            "initiator_id": initiator_id,
            "type": call_type,
            "participants": [initiator_id],
            "offer": None,
            "answers": {},
            "ice_candidates": {}
        }
        
        self.active_calls[call_id] = call_data
        self.user_connections[initiator_id] = call_id
        
        return call_data
    
    async def handle_call_offer(self, data: dict, user_id: int):
        call_id = data["call_id"]
        if call_id in self.active_calls:
            self.active_calls[call_id]["offer"] = data["offer"]
            
            # Уведомляем других участников о звонке
            await self.notify_participants(call_id, {
                "type": "incoming_call",
                "call_id": call_id,
                "offer": data["offer"],
                "initiator_id": user_id
            })
    
    async def handle_call_answer(self, data: dict, user_id: int):
        call_id = data["call_id"]
        if call_id in self.active_calls:
            self.active_calls[call_id]["answers"][user_id] = data["answer"]
            
            # Отправляем ответ инициатору
            await self.send_to_user(
                self.active_calls[call_id]["initiator_id"],
                {
                    "type": "call_answer",
                    "call_id": call_id,
                    "answer": data["answer"],
                    "user_id": user_id
                }
            )