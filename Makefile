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
	make HC_REV=$(HC_REV) update-nix-by-failure
	make HC_REV=$(HC_REV) update-hc-cargoSha

update-hc-sha:
	@if [ $(HC_REV) ]; then\
		echo "⚙️  Updating tryorama using holochain rev: $(HC_REV)";\
		echo "✔  Replacing rev...";\
		sed -i '3s/.*/REV=$(HC_REV)/' ./ci_scripts/install-holochain.sh;\
		sed -i -e 's/^hdk = .*/hdk = {git ="https:\/\/github.com\/holochain\/holochain", rev = "$(HC_REV)", package = "hdk"}/' test/e2e/fixture/zomes/test/Cargo.toml;\
		sed -i -e 's/^Note: this version of tryorama is tested against holochain rev .*/Note: this version of tryorama is tested against holochain rev $(HC_REV)/' README.md;\
		sed -i -e 's/^      rev = .*/      rev = "$(HC_REV)";/' default.nix;\
		sed -i -e 's/^      sha256 = .*/      sha256 = "$(shell nix-prefetch-url --unpack "https://github.com/holochain/holochain/archive/$(HC_REV).tar.gz")";/' default.nix;\
	else \
		echo "No holochain rev provided"; \
  fi

update-nix-by-failure:
	@if [ $(HC_REV) ]; then\
		echo "➳  Corrupting cargoSha256...";\
		sed -i -e 's/^     cargoSha256 = .*/     cargoSha256 = "000000000000000000000000000000000000000000000000000a";/' default.nix;\
		echo "➳  Getting cargoSha256... This can take a while...";\
		nix-shell &>nix.log || echo "This was ment to fail :)...";\
	else \
		echo "No holochain rev provided"; \
  fi


update-hc-cargoSha:
	@if [ $(HC_REV) ]; then\
		echo "➳  Waiting for 5s..."$*;\
		sleep 5;\
		echo "✔  Replacing cargoSha256...";\
		$(eval CARGOSHA256=$(shell sh -c "grep "got" ./nix.log" | awk '{print $$2}'))\
		sed -i -e 's/^     cargoSha256 = .*/     cargoSha256 = "$(CARGOSHA256)";/' default.nix;\
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
