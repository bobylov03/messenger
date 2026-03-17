import asyncio
from typing import Dict
import subprocess
import json
from pathlib import Path

class BotManager:
    def __init__(self):
        self.bots: Dict[str, dict] = {}
        self.load_bots()
    
    def load_bots(self):
        """Загружаем ботов из директории"""
        bot_dir = Path("backend/bots")
        for bot_file in bot_dir.glob("*.py"):
            if bot_file.name != "bot_manager.py":
                self.bots[bot_file.stem] = {
                    "path": bot_file,
                    "enabled": True
                }
    
    async def process_message(self, message, db):
        """Обрабатываем сообщение через всех ботов"""
        for bot_name, bot_info in self.bots.items():
            if bot_info["enabled"]:
                try:
                    # Запускаем бот в отдельном процессе
                    process = await asyncio.create_subprocess_exec(
                        "python", str(bot_info["path"]),
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE
                    )
                    
                    # Отправляем сообщение боту
                    input_data = json.dumps({
                        "message": message.content,
                        "chat_id": message.chat_id,
                        "sender_id": message.sender_id
                    })
                    
                    stdout, _ = await process.communicate(input=input_data.encode())
                    
                    # Обрабатываем ответ бота
                    if stdout:
                        response = json.loads(stdout.decode())
                        if response.get("reply"):
                            # Создаем ответное сообщение от бота
                            bot_message = Message(
                                chat_id=message.chat_id,
                                sender_id=-1,  # ID для ботов
                                content=response["reply"],
                                message_type="text"
                            )
                            db.add(bot_message)
                            db.commit()
                            
                except Exception as e:
                    print(f"Ошибка в боте {bot_name}: {e}")