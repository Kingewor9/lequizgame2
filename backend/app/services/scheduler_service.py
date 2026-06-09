from apscheduler.schedulers.background import BackgroundScheduler
import datetime
from app.services.gemini_service import gemini_service
from app.services.telegram_service import get_telegram_service
from app.models import Quiz, Question, Option
from app.utils import generate_id

scheduler = BackgroundScheduler()

def generate_periodic_quiz_job():
    print("[SCHEDULER] Running periodic automated quiz generation job (every 15 mins)...")
    
    # 1. Fetch recent questions to prevent repetition
    recent_quizzes = Quiz.objects.order_by('-created_at').limit(3)
    recent_questions = []
    for qz in recent_quizzes:
        if qz.questions:
            for q in qz.questions:
                recent_questions.append(q.question_text)
                
    # 2. Call Gemini
    num_questions = 6
    points_per_question = 25
    quiz_data = gemini_service.generate_fifa_world_cup_quiz(
        num_questions=num_questions, 
        recent_questions=recent_questions
    )
    
    if not quiz_data:
        print("[SCHEDULER] Failed to generate quiz data from Gemini.")
        return
        
    try:
        # 3. Create Quiz model
        # 48 hours from now
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=48)
        
        quiz = Quiz(
            id=generate_id(),
            name=quiz_data.get('name', 'FIFA World Cup Daily Challenge'),
            description=quiz_data.get('description', 'Test your ultimate knowledge on the world\'s biggest football stage!'),
            total_questions=num_questions,
            time_limit_seconds=120, # 2 minutes total
            points_per_question=points_per_question,
            total_points=num_questions * points_per_question,
            cost_in_footy_coins=100,
            is_active=True,
            expires_at=expires_at
        )

        # 4. Create Questions and Options
        questions_array = quiz_data.get('questions', [])
        for q_idx, q_data in enumerate(questions_array):
            question = Question(
                id=generate_id(),
                question_text=q_data.get('question_text'),
                order=q_idx,
            )

            options_data = q_data.get('options', [])
            correct_option_index = q_data.get('correct_option_index', 0)

            for o_idx, o_text in enumerate(options_data):
                option = Option(
                    id=generate_id(),
                    option_text=str(o_text),
                    order=o_idx,
                )
                question.options.append(option)
                
                if o_idx == correct_option_index:
                    question.correct_option_id = option.id
            
            quiz.questions.append(question)
            
        # 5. Save to database
        quiz.save()
        print(f"[SCHEDULER] Successfully saved automated quiz with ID: {quiz.id}")
        
        # 6. Send telegram notification to channel
        try:
            telegram_service = get_telegram_service()
            telegram_service.send_quiz_notification(
                quiz.name,
                quiz.description,
                quiz.total_questions,
                quiz.total_points
            )
            print("[SCHEDULER] Successfully sent telegram notification.")
        except Exception as e:
            print(f"[SCHEDULER] Error sending quiz notification to channel: {str(e)}")
            
    except Exception as e:
        print(f"[SCHEDULER] Exception mapping/saving generated quiz: {e}")

def init_scheduler(app):
    """
    Initialize and start the scheduler. 
    It is recommended to run this within the app_context if DB access is needed immediately.
    """
    # Run every 15 minutes
    scheduler.add_job(
        generate_periodic_quiz_job,
        'interval',
        minutes=15,
        timezone='UTC',
        id='periodic_fifa_world_cup_quiz_generator',
        replace_existing=True
    )
    
    if not scheduler.running:
        scheduler.start()
        print("[SCHEDULER] APScheduler started successfully. Registered periodic quiz job (every 15 mins).")
