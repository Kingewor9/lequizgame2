import os
import json
import traceback
import google.generativeai as genai

class GeminiService:
    def __init__(self):
        self.api_key = os.environ.get('GEMINI_API_KEY')
        if self.api_key:
            genai.configure(api_key=self.api_key)
        else:
            print("[GEMINI] Warning: GEMINI_API_KEY is not set.")

        # Use gemini-pro which is the most universally stable model string
        self.model = 'gemini-pro'

    def generate_fifa_world_cup_quiz(self, num_questions=6, recent_questions=None):
        """
        Generates a FIFA World Cup quiz in JSON format.
        Ensures questions are not repeated by providing optional context of recent questions.
        """
        if not self.api_key:
            print("[GEMINI] Error: API key missing, cannot generate quiz.")
            return None

        recent_context = ""
        if recent_questions and len(recent_questions) > 0:
            recent_context = (
                f"Please do NOT ask any questions similar to the following recent questions: "
                f"{json.dumps(recent_questions)}\n"
            )

        prompt = f"""
You are an expert sports quiz master creating a highly engaging FIFA World Cup quiz.
Generate a quiz with exactly {num_questions} unique and challenging questions about the FIFA World Cup.

{recent_context}
The output MUST be in valid JSON format. Do not use Markdown backticks. Just return raw JSON.
The JSON structure MUST strictly follow this format:

{{
  "name": "FIFA World Cup Daily Challenge",
  "description": "Test your ultimate knowledge on the world's biggest football stage!",
  "questions": [
    {{
      "question_text": "Question goes here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option_index": 0
    }}
  ]
}}

Make sure there are exactly {num_questions} questions, exactly 4 options per question, and the `correct_option_index` is an integer from 0 to 3.
All questions must strictly be about the FIFA World Cup (men's or women's).
"""

        try:
            model = genai.GenerativeModel(self.model)
            response = model.generate_content(prompt)
            
            response_text = response.text.strip()
            # If the model wraps the response in ```json ... ```, strip it
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            parsed_json = json.loads(response_text)
            return parsed_json
            
        except Exception as e:
            print(f"[GEMINI] Exception during quiz generation: {e}")
            traceback.print_exc()
            return None

gemini_service = GeminiService()
