import requests
import os
from flask import current_app
import asyncio


class TelegramBotService:
    """Service for sending notifications via Telegram Bot"""
    
    def __init__(self):
        self.bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
        self.miniapp_url = current_app.config.get('MINIAPP_URL', '')
        self.api_base = f'https://api.telegram.org/bot{self.bot_token}'
    
    def send_quiz_notification(self, user_telegram_id: int, quiz_name: str, quiz_id: str):
        """
        Send notification to user about new quiz with inline button to open mini app
        
        Args:
            user_telegram_id: Telegram user ID
            quiz_name: Name of the quiz
            quiz_id: ID of the quiz
        """
        if not self.bot_token or not self.miniapp_url:
            print(f"[TELEGRAM] Service not configured. Bot Token: {bool(self.bot_token)}, MiniApp URL: {bool(self.miniapp_url)}")
            return False
        
        try:
            text = f"🎯 *New Quiz Available!*\n\n*{quiz_name}*\n\nTap the button below to play and earn points!"
            
            # Create inline button that opens the mini app
            inline_keyboard = {
                "inline_keyboard": [
                    [
                        {
                            "text": "Play Quiz 🚀",
                            "web_app": {
                                "url": self.miniapp_url
                            }
                        }
                    ]
                ]
            }
            
            payload = {
                'chat_id': user_telegram_id,
                'text': text,
                'parse_mode': 'Markdown',
                'reply_markup': inline_keyboard
            }
            
            response = requests.post(f'{self.api_base}/sendMessage', json=payload, timeout=10)
            
            if response.status_code == 200:
                print(f"[TELEGRAM] Quiz notification sent to user {user_telegram_id}")
                return True
            else:
                print(f"[TELEGRAM] Failed to send quiz notification: {response.text}")
                return False
                
        except Exception as e:
            print(f"[TELEGRAM] Error sending quiz notification to {user_telegram_id}: {str(e)}")
            return False
    
    def send_league_join_notification(self, owner_telegram_id: int, user_first_name: str, league_name: str):
        """
        Send notification to league owner when someone joins their league
        
        Args:
            owner_telegram_id: Telegram ID of league owner
            user_first_name: First name of user who joined
            league_name: Name of the league
        """
        if not self.bot_token:
            print(f"[TELEGRAM] Bot token not configured")
            return False
        
        try:
            text = f"👥 *New League Member!*\n\n{user_first_name} just joined your league *{league_name}* 🎉"
            
            payload = {
                'chat_id': owner_telegram_id,
                'text': text,
                'parse_mode': 'Markdown'
            }
            
            response = requests.post(f'{self.api_base}/sendMessage', json=payload, timeout=10)
            
            if response.status_code == 200:
                print(f"[TELEGRAM] League join notification sent to owner {owner_telegram_id}")
                return True
            else:
                print(f"[TELEGRAM] Failed to send league notification: {response.text}")
                return False
                
        except Exception as e:
            print(f"[TELEGRAM] Error sending league notification to {owner_telegram_id}: {str(e)}")
            return False
    
    def send_bulk_notifications(self, user_telegram_ids: list, message_text: str, inline_button=None):
        """
        Send message to multiple users
        
        Args:
            user_telegram_ids: List of telegram user IDs
            message_text: Message to send
            inline_button: Optional button dict with format {"text": "...", "web_app": {"url": "..."}}
        """
        if not self.bot_token:
            print(f"[TELEGRAM] Bot token not configured")
            return 0
        
        success_count = 0
        
        for user_id in user_telegram_ids:
            try:
                payload = {
                    'chat_id': user_id,
                    'text': message_text,
                    'parse_mode': 'Markdown'
                }
                
                if inline_button:
                    payload['reply_markup'] = {
                        "inline_keyboard": [[inline_button]]
                    }
                
                response = requests.post(f'{self.api_base}/sendMessage', json=payload, timeout=10)
                
                if response.status_code == 200:
                    success_count += 1
                else:
                    print(f"[TELEGRAM] Failed to send to {user_id}: {response.text}")
                    
            except Exception as e:
                print(f"[TELEGRAM] Error sending to {user_id}: {str(e)}")
        
        print(f"[TELEGRAM] Bulk notifications: {success_count}/{len(user_telegram_ids)} sent successfully")
        return success_count


def get_telegram_service():
    """Factory function to get telegram service instance"""
    return TelegramBotService()
