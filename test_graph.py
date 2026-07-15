import os
from dotenv import load_dotenv

# Path routing to locate the .env file inside the backend directory
backend_env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
load_dotenv(dotenv_path=backend_env_path)

# Verify keys loaded before firing the graph engine
if not os.getenv("OPENAI_API_KEY"):
    raise ValueError("❌ Environment variables failed to load. Check your backend/.env path alignment.")

from agents.graph import app_engine

def run_simulation():
    # Setup execution session context thread ID tracker
    config = {"configurable": {"thread_id": "session_devmind_001"}}
    
    initial_state = {
        "messages": [{"role": "user", "content": "Write a clean Python function to calculate the mathematical factorial of an integer using recursion."}],
        "workspace_id": "ws_alpha_99",
        "session_id": "sess_001",
        "current_agent": "initializer",
        "suggested_code_artifacts": [],
        "review_approved": False,
        "errors_found": None,
        "sources_cited": []
    }
    
    print("=== STARTING REAL-TIME AGENT ENSEMBLE TEST ===")
    print("Sending prompt to Code Agent via Gemini Gateway...\n")
    
    # Execute the graph synchronously and stream the output states
    for event in app_engine.stream(initial_state, config):
        for node_name, state_patch in event.items():
            print(f"\n⚡ [Node Completed: {node_name}]")
            
            # Print out what the Code Agent generated
            if "suggested_code_artifacts" in state_patch:
                print(f"📄 Latest Code Artifact Matrix:\n{state_patch['suggested_code_artifacts'][-1]}")
            
            # Print out what the Review Agent evaluated
            if "review_approved" in state_patch:
                print(f"🔍 Quality Gate Approved: {state_patch['review_approved']}")
                if state_patch.get("errors_found"):
                    print(f"⚠️ Defect Analysis Trace: {state_patch['errors_found']}")

if __name__ == "__main__":
    run_simulation()