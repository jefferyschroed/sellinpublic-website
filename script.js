const revealTargets = document.querySelectorAll(".texts-reveal");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((target) => {
    target.dataset.reveal = "pending";
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.dataset.reveal = "visible";
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => {
    target.dataset.reveal = "visible";
  });
}

const FAQ_BOOKING_CALENDLY_URL = "https://calendly.com/jeff-tryquicksetters/30min";

document.querySelectorAll(".faq-booking__item").forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    const parent = item.parentElement;
    if (!parent) return;
    parent.querySelectorAll(".faq-booking__item").forEach((sibling) => {
      if (sibling !== item) sibling.removeAttribute("open");
    });
  });
});

document.querySelectorAll("[data-faq-booking]").forEach((bookingCard) => {
  const calendlyUrl = bookingCard.dataset.calendlyBaseUrl || FAQ_BOOKING_CALENDLY_URL;
  const dateButtons = Array.from(bookingCard.querySelectorAll("[data-faq-booking-date]"));
  const timeButtons = Array.from(bookingCard.querySelectorAll("[data-faq-booking-time]"));
  const bookingCta = bookingCard.querySelector("[data-faq-booking-cta]");
  const emailFallback = bookingCard.querySelector("[data-faq-booking-email]");
  const status = bookingCard.querySelector("[data-faq-booking-status]");

  const selectOption = (buttons, selectedButton) => {
    buttons.forEach((button) => {
      const isSelected = button === selectedButton;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  };

  const getSelectedOption = (buttons) => (
    buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0]
  );

  const syncBookingState = () => {
    const selectedDate = getSelectedOption(dateButtons);
    const selectedTime = getSelectedOption(timeButtons);
    const dateIso = selectedDate?.dataset.faqBookingDate || "";
    const dateLabel = selectedDate?.dataset.faqBookingDateLabel || selectedDate?.textContent.trim() || "";
    const timeValue = selectedTime?.dataset.faqBookingTime || "";
    const timeLabel = selectedTime?.dataset.faqBookingTimeLabel || selectedTime?.textContent.trim() || "";

    bookingCard.dataset.selectedDate = dateIso;
    bookingCard.dataset.selectedDateLabel = dateLabel;
    bookingCard.dataset.selectedTime = timeValue;
    bookingCard.dataset.selectedTimeLabel = timeLabel;

    if (bookingCta) {
      bookingCta.href = calendlyUrl;
      bookingCta.dataset.selectedDate = dateIso;
      bookingCta.dataset.selectedTime = timeValue;
      bookingCta.dataset.calendlyUrl = calendlyUrl;
    }

    if (status) {
      status.textContent = dateLabel && timeLabel
        ? `Selected: ${dateLabel} at ${timeLabel}`
        : "Select an intro call day and time";
    }

    if (emailFallback) {
      const subject = "Intro call request";
      const body = dateLabel && timeLabel
        ? `Hi Jeff,\n\nI would like to book an intro call around ${dateLabel} at ${timeLabel}.\n\n`
        : "Hi Jeff,\n\nI would like to book an intro call.\n\n";
      emailFallback.href = `mailto:hello@sellinpublic.co?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
  };

  if (dateButtons.length) {
    selectOption(dateButtons, getSelectedOption(dateButtons));
  }

  if (timeButtons.length) {
    selectOption(timeButtons, getSelectedOption(timeButtons));
  }

  dateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectOption(dateButtons, button);
      syncBookingState();
    });
  });

  timeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectOption(timeButtons, button);
      syncBookingState();
    });
  });

  syncBookingState();
});
