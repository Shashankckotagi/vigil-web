PYTHON ?= $(shell if [ -f ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)

.PHONY: install test serve demo sweep figures clean

install:
	pip install -r requirements.txt

test:
	$(PYTHON) tests/test_vigil.py
	$(PYTHON) tests/test_events.py
	$(PYTHON) tests/test_server.py
	$(PYTHON) tests/test_frontend.py
	$(PYTHON) tests/test_vite_app.py
	$(PYTHON) tests/test_backend_core.py
	$(PYTHON) tests/test_server_comprehensive.py
	$(PYTHON) tests/test_robustness_edge_cases.py
	$(PYTHON) tests/test_server_security_and_stress.py
	$(PYTHON) tests/test_youtube_robustness.py
	npm test

serve:
	$(PYTHON) -m uvicorn server:app --reload --port 8000

demo:
	$(PYTHON) experiments/run_experiment.py --input sample/demo_clip.avi \
		--runs A B C D --no-audio --speed 8

sweep:
	$(PYTHON) experiments/run_experiment.py --input sample/demo_clip.avi \
		--sweep --no-audio --speed 8

figures:
	$(PYTHON) experiments/analyze.py --log-dir logs \
		--annotations sample/annotations.csv --out-dir figures

clean:
	rm -rf logs/*.csv logs/*.json __pycache__ */__pycache__ dist
