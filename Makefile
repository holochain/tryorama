.PHONY: test

VERSION:=$(shell npm view '@holochain/tryorama' version)

get-version:
	@echo 'Version: '${VERSION}

install-hc:
	./ci_scripts/install-holochain.sh

test:
	make install-hc
	make test-all

test-all:
	./ci_scripts/run-test.sh

#############################
# █░█ █▀█ █▀▄ ▄▀█ ▀█▀ █▀▀ ▄▄ █▀ █▀▀ █▀█ █ █▀█ ▀█▀ █▀
# █▄█ █▀▀ █▄▀ █▀█ ░█░ ██▄ ░░ ▄█ █▄▄ █▀▄ █ █▀▀ ░█░ ▄█
#############################
# How to update holochain?
# make HC_REV="HC_REV" update-hc
# Example use: make HC_REV="f0e38fd9895054115d8755572e29a5d3639f69e6" update-hc
# Note: After running this we should run the tests and check

update-hc:
	make HC_REV=$(HC_REV) update-hc-sha

update-hc-sha:
	@if [ $(HC_REV) ]; then\
		echo "⚙️  Updating tryorama using holochain rev: $(HC_REV)";\
		echo "✔  Replacing rev...";\
		sed -i '3s/.*/REV=$(HC_REV)/' ./ci_scripts/install-holochain.sh;\
		sed -i -e 's/^hdk = .*/hdk = {git ="https:\/\/github.com\/holochain\/holochain", rev = "$(HC_REV)", package = "hdk"}/' test/e2e/fixture/zomes/test/Cargo.toml;\
		sed -i -e 's/^Note: this version of tryorama is tested against holochain rev .*/Note: this version of tryorama is tested against holochain rev $(HC_REV)/' README.md;\
	else \
		echo "No holochain rev provided"; \
  fi

#############################
# █▀█ █▀▀ █░░ █▀▀ ▄▀█ █▀ █▀▀
# █▀▄ ██▄ █▄▄ ██▄ █▀█ ▄█ ██▄
#############################

release:
	make release-minor
	git checkout -b release-${VERSION}
	git add .
	git commit -m release-${VERSION}
	git push origin HEAD

# use this  to make a minor release 1.1 to 1.2
release-minor:
	npm version minor --force && npm publish

# use this  to make a major release 1.1 to 2.1
release-major:
	npm version major --force && npm publish
