import asyncio
import inspect
from run_evals import build_evaluators, build_dataset
from ragas.metrics import Faithfulness
from ragas import SingleTurnSample


async def debug_one_sample():
    llm, _ = build_evaluators()
    metric = Faithfulness(llm=llm, max_retries=3)
    print(dir(metric))

    # print the constructor signature — tells us if there's a
    # self-consistency / n / reproducibility parameter we can control
    print("Faithfulness signature:", inspect.signature(Faithfulness.__init__))
    print()

    dataset = build_dataset()
    sample = dataset.samples[0]  # the "DEBUG: def add..." one that scored 0.000

    score = await metric.single_turn_ascore(sample)
    print("Score:", score)

    # try to find any stored intermediate state (claims list) on the metric object
    for attr in vars(metric):
        print(f"  metric.{attr} = {getattr(metric, attr)!r}"[:300])

asyncio.run(debug_one_sample())