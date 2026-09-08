.PHONY: setup demo test
setup:
	npm ci --ignore-scripts
	npm run build

demo:
	python3 scripts/serve.py

test:
	npm test
	npm run build
