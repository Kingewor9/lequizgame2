import requests
import os
import math
import threading
import time
from datetime import datetime
from flask import current_app, has_app_context
import asyncio

TOURNAMENT_QUIZ_IMAGE_URL = 'https://ibb.co/Lz1qWjVQ'


class TelegramBotService:
    """Service for sending notifications via Telegram Bot"""
    
    def __init__(self):
        if has_app_context():
            self.bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
            self.miniapp_url = current_app.config.get('MINIAPP_URL', '')
            self.channel_url = current_app.config.get('TELEGRAM_CHANNEL_URL', '')
        else:
            self.bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
            self.miniapp_url = os.environ.get('MINIAPP_URL', '')
            self.channel_url = os.environ.get('TELEGRAM_CHANNEL_URL', '')
        self.api_base = f'https://api.telegram.org/bot{self.bot_token}'
        self.channel_id = self._extract_channel_id()
    
    def _extract_channel_id(self):
        """Extract channel identifier from URL (e.g., @channelname from https://t.me/channelname)"""
        if not self.channel_url:
            return None
        
        # Handle format: https://t.me/channelname
        if 'https://t.me/' in self.channel_url:
            channel_name = self.channel_url.replace('https://t.me/', '').strip('/')
            return f'@{channel_name}'
        
        # Handle format: https://t.me/c/123456789 (private channels with numeric IDs)
        if '/c/' in self.channel_url:
            channel_id = self.channel_url.split('/c/')[-1].strip('/')
            return f'-100{channel_id}'
        
        return None
    
    def send_quiz_notification(
        self,
        quiz_name: str,
        quiz_description: str,
        total_questions: int,
        total_points: int,
        user_telegram_ids: list = None,
        async_send: bool = True,
        expires_at=None,
        tournament_name: str = None,
    ) -> bool:
        """
        Send quiz notification directly to registered users via Telegram Bot.
        
        Args:
            quiz_name: Name of the quiz
            quiz_description: Description of the quiz
            total_questions: Total number of questions in the quiz
            total_points: Total points available in the quiz
            user_telegram_ids: Optional list of target user telegram IDs. If None, queries all users from DB.
            async_send: If True (default), broadcasts in a background thread so callers are not blocked.
        """
        if not self.bot_token:
            print("[TELEGRAM] Bot service not configured. Missing: TELEGRAM_BOT_TOKEN")
            return False

        if user_telegram_ids is None:
            try:
                from app.models import User
                users = User.objects(telegram_id__ne=None).only('telegram_id')
                user_telegram_ids = list({u.telegram_id for u in users if getattr(u, 'telegram_id', None)})
            except Exception as e:
                print(f"[TELEGRAM] Error fetching users from database: {e}")
                user_telegram_ids = []

        if not user_telegram_ids:
            print("[TELEGRAM] No registered users found to notify.")
            return True

        if async_send:
            thread = threading.Thread(
                target=self._dispatch_quiz_notifications_to_users,
                args=(
                    user_telegram_ids,
                    quiz_name,
                    quiz_description,
                    total_questions,
                    total_points,
                    expires_at,
                    tournament_name,
                ),
                daemon=True
            )
            thread.start()
            return True
        else:
            self._dispatch_quiz_notifications_to_users(
                user_telegram_ids,
                quiz_name,
                quiz_description,
                total_questions,
                total_points,
                expires_at,
                tournament_name,
            )
            return True

    def _dispatch_quiz_notifications_to_users(
        self,
        user_telegram_ids: list,
        quiz_name: str,
        quiz_description: str,
        total_questions: int,
        total_points: int,
        expires_at=None,
        tournament_name: str = None,
    ) -> int:
        """Helper to broadcast quiz notifications directly to users via the bot."""
        description_line = f"\n{quiz_description}" if quiz_description else ""
        expiry_line = ""
        if expires_at:
            now = datetime.now(expires_at.tzinfo) if expires_at.tzinfo else datetime.utcnow()
            hours_remaining = max(
                0,
                math.ceil((expires_at - now).total_seconds() / 3600),
            )
            expiry_text = (
                'Expired'
                if hours_remaining == 0
                else f'{hours_remaining} hour' + ('' if hours_remaining == 1 else 's')
            )
            expiry_line = f"\n⏳ *Expires in:* {expiry_text}\n"
        if tournament_name:
            text = (
                f"🏆 *Tournament Quiz Available!*\n\n"
                f"*Tournament:* {tournament_name}\n"
                f"*{quiz_name}*{description_line}\n\n"
                f"📝 *Questions:* {total_questions}\n"
                f"⭐ *Points Available:* {total_points}"
                f"{expiry_line}\n"
                f"Open the tournament in Footy IQ to play this quiz!"
            )
        else:
            text = (
                f"🎯 *New Quiz Available!*\n\n"
                f"*{quiz_name}*{description_line}\n\n"
                f"📝 *Questions:* {total_questions}\n"
                f"⭐ *Points Available:* {total_points}"
                f"{expiry_line}\n"
                f"Tap the button below to play and earn points!"
            )

        reply_markup = None
        if self.miniapp_url:
            reply_markup = {
                "inline_keyboard": [
                    [
                        {
                            "text": "Play Quiz 🚀",
                            "url": self.miniapp_url
                        }
                    ]
                ]
            }

        image_url = (
            TOURNAMENT_QUIZ_IMAGE_URL
            if tournament_name
            else "https://i.ibb.co/tTXt8Mbx/cropped-best-bike-3.png"
        )

        total_users = len(user_telegram_ids)
        print(f"[TELEGRAM] Starting quiz notification broadcast to {total_users} users via bot...")

        success_count = 0
        blocked_count = 0
        error_count = 0

        for user_id in user_telegram_ids:
            try:
                # 1. Try sending Photo with Caption and Inline Button
                payload = {
                    'chat_id': user_id,
                    'photo': image_url,
                    'caption': text,
                    'parse_mode': 'Markdown'
                }
                if reply_markup:
                    payload['reply_markup'] = reply_markup

                response = requests.post(f'{self.api_base}/sendPhoto', json=payload, timeout=10)

                # Handle rate limiting (HTTP 429)
                if response.status_code == 429:
                    try:
                        retry_after = response.json().get('parameters', {}).get('retry_after', 1)
                    except Exception:
                        retry_after = 1
                    time.sleep(retry_after)
                    response = requests.post(f'{self.api_base}/sendPhoto', json=payload, timeout=10)

                if response.status_code == 200:
                    success_count += 1
                elif response.status_code == 403:
                    # User blocked the bot or account deactivated
                    blocked_count += 1
                else:
                    # Photo failed (e.g. photo URL error or caption parse issue). Fallback to sendMessage
                    msg_payload = {
                        'chat_id': user_id,
                        'text': text,
                        'parse_mode': 'Markdown'
                    }
                    if reply_markup:
                        msg_payload['reply_markup'] = reply_markup

                    fallback_res = requests.post(f'{self.api_base}/sendMessage', json=msg_payload, timeout=10)
                    if fallback_res.status_code == 200:
                        success_count += 1
                    elif fallback_res.status_code == 400:
                        # Markdown parse error: retry plain text without Markdown parse_mode
                        msg_payload.pop('parse_mode', None)
                        plain_res = requests.post(f'{self.api_base}/sendMessage', json=msg_payload, timeout=10)
                        if plain_res.status_code == 200:
                            success_count += 1
                        else:
                            error_count += 1
                    elif fallback_res.status_code == 403:
                        blocked_count += 1
                    else:
                        error_count += 1

                # Polite delay between messages to respect Telegram limits (~20 msgs/sec max)
                time.sleep(0.05)

            except Exception as e:
                error_count += 1
                print(f"[TELEGRAM] Error sending quiz notification to user {user_id}: {str(e)}")

        print(
            f"[TELEGRAM] Quiz notification broadcast finished: {success_count} sent, "
            f"{blocked_count} blocked/inactive, {error_count} failed "
            f"(Total target: {total_users} users)"
        )
        return success_count

    def send_quiz_notification_to_channel(self, quiz_name: str, quiz_description: str, total_questions: int, total_points: int):
        """
        Send quiz notification to Telegram channel (optional/legacy)
        """
        if not self.bot_token or not self.channel_id:
            print("[TELEGRAM] Channel notification skipped: missing bot token or channel id")
            return False

        try:
            description_line = f"\n{quiz_description}" if quiz_description else ""
            text = (
                f"🎯 *New Quiz Available!*\n\n"
                f"*{quiz_name}*{description_line}\n\n"
                f"📝 *Questions:* {total_questions}\n"
                f"⭐ *Points Available:* {total_points}\n\n"
                f"Tap the button below to play and earn points!"
            )
            inline_keyboard = {
                "inline_keyboard": [
                    [
                        {
                            "text": "Play Quiz 🚀",
                            "url": self.miniapp_url
                        }
                    ]
                ]
            }
            image_url = "https://i.ibb.co/tTXt8Mbx/cropped-best-bike-3.png"
            payload = {
                'chat_id': self.channel_id,
                'photo': image_url,
                'caption': text,
                'parse_mode': 'Markdown',
                'reply_markup': inline_keyboard
            }
            response = requests.post(f'{self.api_base}/sendPhoto', json=payload, timeout=10)
            return response.status_code == 200
        except Exception as e:
            print(f"[TELEGRAM] Error sending quiz notification to channel: {str(e)}")
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

    def send_welcome_message(self, user_telegram_id: int, user_first_name: str):
        """Send a plain-text welcome message when a user launches the Mini App."""
        if not self.bot_token:
            print("[TELEGRAM] Bot token not configured; welcome message was not sent")
            return False

        first_name = (user_first_name or '').strip()
        text = (
            f"👋 Welcome back, {first_name}! ⚽\n\n"
            "Ready to test your football knowledge? Jump into Footy IQ and keep the game going!"
        ) if first_name else (
            "👋 Welcome back to Footy IQ! ⚽\n\n"
            "Ready to test your football knowledge? Jump into the app and keep the game going!"
        )

        try:
            response = requests.post(
                f'{self.api_base}/sendMessage',
                json={'chat_id': user_telegram_id, 'text': text},
                timeout=10,
            )
            if response.status_code == 200:
                print(f"[TELEGRAM] Welcome message sent to user {user_telegram_id}")
                return True

            print(
                f"[TELEGRAM] Failed to send welcome message to {user_telegram_id}: "
                f"{response.text}"
            )
            return False
        except requests.RequestException as error:
            print(f"[TELEGRAM] Error sending welcome message to {user_telegram_id}: {error}")
            return False

    def send_battle_notification(self, user_telegram_id: int, message_text: str) -> bool:
        """Send a direct 1v1 battle update and report Telegram delivery failures."""
        if not self.bot_token:
            if has_app_context():
                current_app.logger.error(
                    'Battle notification skipped for Telegram user %s: bot token is not configured',
                    user_telegram_id,
                )
            else:
                print('[TELEGRAM] Battle notification skipped: bot token is not configured')
            return False
        if not user_telegram_id:
            if has_app_context():
                current_app.logger.error(
                    'Battle notification skipped: user has no Telegram chat ID'
                )
            else:
                print('[TELEGRAM] Battle notification skipped: user has no Telegram chat ID')
            return False

        payload = {'chat_id': user_telegram_id, 'text': message_text}
        if self.miniapp_url:
            payload['reply_markup'] = {
                'inline_keyboard': [[{
                    'text': 'Open Footy IQ',
                    'url': self.miniapp_url,
                }]]
            }
        try:
            response = requests.post(
                f'{self.api_base}/sendMessage',
                json=payload,
                timeout=10,
            )
            try:
                telegram_result = response.json()
            except ValueError:
                telegram_result = {}
            if response.status_code == 200 and telegram_result.get('ok') is True:
                if has_app_context():
                    current_app.logger.info(
                        'Telegram battle notification delivered to user %s',
                        user_telegram_id,
                    )
                return True

            error_description = telegram_result.get(
                'description',
                response.text[:500] or 'Telegram returned an unsuccessful response',
            )
            if has_app_context():
                current_app.logger.error(
                    'Telegram battle notification failed for user %s (HTTP %s): %s',
                    user_telegram_id,
                    response.status_code,
                    error_description,
                )
            else:
                print(
                    f'[TELEGRAM] Battle notification failed for {user_telegram_id} '
                    f'(HTTP {response.status_code}): {error_description}'
                )
            return False
        except requests.RequestException as error:
            if has_app_context():
                current_app.logger.exception(
                    'Telegram request failed for battle notification to user %s',
                    user_telegram_id,
                )
            else:
                print(f'[TELEGRAM] Battle notification request failed: {error}')
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

    def send_tournament_message(self, user_telegram_ids: list, message_text: str) -> bool:
        """Queue plain-text tournament notifications for the listed players."""
        if not self.bot_token:
            print("[TELEGRAM] Tournament notification skipped: bot is not configured")
            return False
        if not user_telegram_ids:
            return True

        threading.Thread(
            target=self._dispatch_tournament_message,
            args=(user_telegram_ids, message_text),
            daemon=True,
        ).start()
        return True

    def _dispatch_tournament_message(self, user_telegram_ids: list, message_text: str):
        for user_id in user_telegram_ids:
            try:
                response = requests.post(
                    f'{self.api_base}/sendMessage',
                    json={'chat_id': user_id, 'text': message_text},
                    timeout=10,
                )
                if response.status_code != 200:
                    print(
                        f"[TELEGRAM] Tournament notification failed for {user_id}: "
                        f"{response.status_code} {response.text}"
                    )
            except requests.RequestException as error:
                print(
                    f"[TELEGRAM] Tournament notification error for {user_id}: {error}"
                )

    def send_broadcast(
        self,
        user_telegram_ids: list,
        message_text: str,
        image_url: str = None,
        cta_link: str = None,
        cta_text: str = None,
        async_send: bool = True,
    ) -> bool:
        """Send an admin-authored message, with optional image and inline URL button."""
        if not self.bot_token:
            raise RuntimeError('Telegram bot is not configured')
        if len(message_text) > 4096:
            raise ValueError('Broadcast messages must be 4,096 characters or fewer')
        if image_url and len(message_text) > 1024:
            raise ValueError('Messages sent with an image must be 1,024 characters or fewer')

        if async_send:
            thread = threading.Thread(
                target=self._dispatch_broadcast,
                args=(user_telegram_ids, message_text, image_url, cta_link, cta_text),
                daemon=True,
            )
            thread.start()
        else:
            self._dispatch_broadcast(user_telegram_ids, message_text, image_url, cta_link, cta_text)
        return True

    def _dispatch_broadcast(
        self,
        user_telegram_ids: list,
        message_text: str,
        image_url: str = None,
        cta_link: str = None,
        cta_text: str = None,
    ) -> int:
        """Deliver a broadcast to each registered Telegram user."""
        reply_markup = None
        if cta_link and cta_text:
            reply_markup = {
                'inline_keyboard': [[{'text': cta_text, 'url': cta_link}]]
            }

        success_count = 0
        failed_count = 0
        for user_id in user_telegram_ids:
            try:
                if image_url:
                    photo_payload = {
                        'chat_id': user_id,
                        'photo': image_url,
                        'caption': message_text,
                    }
                    if reply_markup:
                        photo_payload['reply_markup'] = reply_markup
                    response = None
                    try:
                        response = requests.post(
                            f'{self.api_base}/sendPhoto',
                            json=photo_payload,
                            timeout=15,
                        )
                        try:
                            photo_sent = response.status_code == 200 and response.json().get('ok')
                        except ValueError:
                            photo_sent = False
                    except requests.RequestException as error:
                        photo_sent = False
                        print(f"[TELEGRAM] Broadcast image request failed for user {user_id}: {error}")
                    if photo_sent:
                        success_count += 1
                    else:
                        if response is not None:
                            print(
                                f"[TELEGRAM] Broadcast image failed for user {user_id}: "
                                f"{response.status_code} {response.text}"
                            )
                        sent = self._send_broadcast_text(user_id, message_text, reply_markup)
                        success_count += sent
                        failed_count += int(not sent)
                else:
                    sent = self._send_broadcast_text(user_id, message_text, reply_markup)
                    success_count += sent
                    failed_count += int(not sent)
            except requests.RequestException as error:
                failed_count += 1
                print(f"[TELEGRAM] Broadcast failed for user {user_id}: {error}")
            except Exception as error:
                failed_count += 1
                print(f"[TELEGRAM] Unexpected broadcast error for user {user_id}: {error}")

            time.sleep(0.05)

        print(
            f"[TELEGRAM] Broadcast finished: {success_count} sent, "
            f"{failed_count} failed (target: {len(user_telegram_ids)} users)"
        )
        return success_count

    def _send_broadcast_text(self, user_id: int, message_text: str, reply_markup) -> int:
        payload = {'chat_id': user_id, 'text': message_text}
        if reply_markup:
            payload['reply_markup'] = reply_markup
        response = requests.post(
            f'{self.api_base}/sendMessage',
            json=payload,
            timeout=15,
        )
        try:
            sent = response.status_code == 200 and response.json().get('ok')
        except ValueError:
            sent = False
        if not sent:
            print(
                f"[TELEGRAM] Broadcast text failed for user {user_id}: "
                f"{response.status_code} {response.text}"
            )
        return int(bool(sent))


def get_telegram_service():
    """Factory function to get telegram service instance"""
    return TelegramBotService()
