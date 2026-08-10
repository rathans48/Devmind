import asyncio
import inspect

from run_evals import build_evaluators, build_dataset
from ragas.metrics import Faithfulness

async def debug_one_sample():
    llm, _ = build_evaluators()
    metric = Faithfulness(llm=llm, max_retries=3)

    print("_create_statements signature:", inspect.signature(metric._create_statements))
    print("_create_verdicts signature:", inspect.signature(metric._create_verdicts))
    print()

    dataset = build_dataset()
    sample = dataset.samples[0]  # "DEBUG: def add..." — the one scoring 0.000

    row = {
        "user_input": sample.user_input,
        "response": sample.response,
        "retrieved_contexts": sample.retrieved_contexts,
    }

    statements = await metric._create_statements(row, callbacks=[])
    statement_list = statements.statements
    print("EXTRACTED STATEMENTS:")
    print(statements)
    print()

    verdicts = await metric._create_verdicts(row, statements, callbacks=[])
    print("VERDICTS:")
    print(verdicts)

asyncio.run(debug_one_sample())